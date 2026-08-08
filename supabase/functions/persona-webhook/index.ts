/**
 * `persona-webhook` — spec §6.2 / §6.6, and the top row of the §8.3 threat model.
 *
 * THE SOLE WRITER of `verifications.provider_status` and `verifications.age_verified`.
 * Nothing else may set them: not the app, not the client SDK's `onComplete` (a UI hint only,
 * §6), not an operator. `issue-device-session` reads what this function writes to decide
 * whether to release key material, so this handler IS the age gate.
 *
 * It is a public, unauthenticated endpoint by nature — Persona cannot present a user JWT — so
 * the signature is the only thing separating a real vendor decision from an attacker's POST.
 * Deploy with `--no-verify-jwt`; the signature check below replaces JWT auth, it does not
 * supplement it.
 *
 * ── Order of operations is load-bearing ────────────────────────────────────────────────
 * 1. Read the RAW body as text. Never `await req.json()` first: re-serialising breaks the
 *    HMAC (see _shared/personaSignature.ts note 1), and parsing attacker-controlled JSON
 *    before authenticating it is the bug the signature exists to prevent.
 * 2. Verify the signature. Anything short of a proven match returns 401 and stops.
 * 3. Only then parse, and only then touch the database.
 *
 * ── 🔴 Logging rule (CLAUDE.md rule 1, spec §8.1) ──────────────────────────────────────
 * `inquiry_id` must never be logged beside anything that re-identifies the person. This
 * handler holds an inquiry_id AND a user_id at the same time, which makes it the one place in
 * the codebase where a single careless log line links a vendor record to an account. Nothing
 * below logs either one. Do not add `console.log(payload)` here while debugging — the payload
 * carries both.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyPersonaSignature } from '../_shared/personaSignature.ts';

/**
 * Persona's documented inquiry statuses (docs.withpersona.com/model-lifecycle).
 *
 * PASSING is deliberately the narrowest possible set. `expired` and `needs_review` are NOT
 * passes: `expired` means the user never finished, and `needs_review` means a human has not
 * decided yet — treating either as verified would open the gate on an undecided inquiry.
 * Anything unrecognised is also not a pass; a status Persona adds later must fail closed
 * rather than be guessed at.
 */
const PASSING_STATUSES = new Set(['completed', 'approved']);
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'declined', 'expired']);

interface PersonaEvent {
  data?: {
    attributes?: {
      name?: string;
      payload?: {
        data?: {
          id?: string;
          attributes?: { status?: string; 'reference-id'?: string; referenceId?: string };
        };
      };
    };
  };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  // ── 1. RAW body, before anything else ────────────────────────────────────
  const rawBody = await req.text();

  // ── 2. Authenticate the request ──────────────────────────────────────────
  const secret = Deno.env.get('PERSONA_WEBHOOK_SECRET') ?? '';
  const verification = await verifyPersonaSignature({
    rawBody,
    header: req.headers.get('Persona-Signature'),
    secret,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  if (!verification.valid) {
    // Log the reason for us; return a flat 401 with no detail. Telling the caller whether it
    // failed on the digest or the clock hands them an oracle for tuning an attack.
    console.error(`persona-webhook: signature rejected — ${verification.reason}`);
    return json(401, { error: 'INVALID_SIGNATURE' });
  }

  // ── 3. Now, and only now, the body may be parsed ─────────────────────────
  let event: PersonaEvent;
  try {
    event = JSON.parse(rawBody) as PersonaEvent;
  } catch {
    return json(400, { error: 'MALFORMED_BODY' });
  }

  const eventName = event.data?.attributes?.name;
  const inquiry = event.data?.attributes?.payload?.data;
  const inquiryId = inquiry?.id;
  const status = inquiry?.attributes?.status;

  if (!inquiryId) {
    console.error(`persona-webhook: no inquiry id on event "${eventName ?? 'unknown'}"`);
    return json(400, { error: 'MISSING_INQUIRY_ID' });
  }

  // ⚠️ The exact JSON path to `status` is the one field NOT confirmed against Persona's
  // published docs — the quickstart shows the event name and inquiry id paths but never a
  // full payload. It is read defensively here and treated as a non-pass when absent, so an
  // incorrect path fails CLOSED (nobody gets verified) rather than open. Confirm against a
  // real sandbox delivery before this is relied on — spec §6.6.
  if (!status) {
    console.error(`persona-webhook: no status on event "${eventName ?? 'unknown'}" — not a pass`);
  }

  const isPass = status ? PASSING_STATUSES.has(status) : false;
  const isTerminal = status ? isPass || TERMINAL_FAILURE_STATUSES.has(status) : false;

  // Non-terminal events (inquiry.created, inquiry.started, needs_review, ...) are
  // acknowledged and ignored. Returning 200 stops Persona retrying something we deliberately
  // did not act on.
  if (!isTerminal) {
    return json(200, { ok: true, applied: false });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // Service role: this function must write a table no client role can write. This key must
    // exist ONLY in Edge Function secrets — it bypasses every RLS policy.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Idempotency, defence 2 of 2 (the freshness window is defence 1). Persona retries
  // deliveries, so the same terminal event WILL arrive more than once in normal operation.
  // Matching on the pending row and refusing to overwrite an already-decided one means a
  // replay is a no-op rather than a second write.
  const { data: existing, error: readError } = await supabase
    .from('verifications')
    .select('id, age_verified, provider_status')
    .eq('inquiry_id', inquiryId)
    .maybeSingle();

  if (readError) {
    console.error(`persona-webhook: lookup failed — ${readError.message}`);
    return json(500, { error: 'LOOKUP_FAILED' });
  }

  if (!existing) {
    // No row means create-inquiry never recorded this inquiry. Do NOT create one here: this
    // function cannot know which user an unknown inquiry belongs to, and inventing that link
    // from a webhook body would let a forged-but-signed replay attach a verification to an
    // arbitrary account. 404 so the mismatch is visible rather than silent.
    console.error('persona-webhook: no pending verification row for this inquiry');
    return json(404, { error: 'UNKNOWN_INQUIRY' });
  }

  // Already decided — a retry or a replay. Acknowledge without rewriting.
  if (existing.provider_status && existing.provider_status !== 'pending') {
    return json(200, { ok: true, applied: false, reason: 'already_decided' });
  }

  const { error: writeError } = await supabase
    .from('verifications')
    .update({
      age_verified: isPass,
      provider_status: status,
      verified_at: new Date().toISOString(),
      outcome_reason: isPass ? 'pass' : 'vendor_declined',
    })
    .eq('id', existing.id)
    // Compare-and-set: only transition a still-pending row. Two concurrent deliveries then
    // cannot both write, without needing an explicit lock.
    .eq('provider_status', 'pending');

  if (writeError) {
    console.error(`persona-webhook: write failed — ${writeError.message}`);
    return json(500, { error: 'WRITE_FAILED' });
  }

  // Metadata only — never the inquiry_id, never the user_id (spec §5.2.8, §8.1).
  await supabase.from('audit_log').insert({
    event: 'verification_submitted',
    metadata: { source: 'persona-webhook', passed: isPass },
  });

  return json(200, { ok: true, applied: true });
});
