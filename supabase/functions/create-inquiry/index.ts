/**
 * `create-inquiry` — spec §6.2, increment 2 (roadmap P2-8.0).
 *
 * Creates the PENDING `verifications` row for the calling user and returns the inquiry
 * handle the app hands to Persona's SDK. Runs user-JWT-in, service-role-out: the caller
 * proves who they are with their JWT, and the row is written with the service role because
 * §5.3 gives clients no INSERT path on `verifications` at all (a client INSERT would be a
 * user asserting their own age_verified — inviolable rule 3 inverted).
 *
 * This function NEVER sets `age_verified`. It writes `provider_status = 'pending'` and stops.
 * Only `persona-webhook`, having verified a vendor signature, may decide an outcome. If this
 * function ever gains a code path that writes `age_verified = true`, the age gate is gone.
 *
 * 🔴 It holds a user_id and an inquiry_id simultaneously and must log NEITHER (§8.1).
 *
 * ── Increment note ─────────────────────────────────────────────────────────────────────
 * P2-1.0 (already on stage) creates the inquiry CLIENT-side from a template id, so today the
 * app can run without this function. That shape cannot be secured — the client picks its own
 * inquiry and nothing ties it to a user server-side — so §6 defines this as the increment
 * that replaces it. Until the app switches over, this endpoint is the forward path, not dead
 * code.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCreateInquiryRequest,
  buildIdempotencyKey,
  buildResumeInquiryRequest,
  isConcurrentInquiryInsertRace,
  parseCreateInquiryResponse,
  parseResumeInquiryResponse,
} from '../_shared/personaInquiry.ts';

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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'UNAUTHENTICATED' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const templateId = Deno.env.get('PERSONA_TEMPLATE_ID') ?? '';
  const personaApiKey = Deno.env.get('PERSONA_API_KEY') ?? '';

  if (!supabaseUrl || !anonKey || !serviceKey || !templateId || !personaApiKey) {
    // Fail closed and say nothing specific: which variable is missing is deployment detail.
    console.error('create-inquiry: incomplete environment configuration');
    return json(500, { error: 'NOT_CONFIGURED' });
  }

  // Resolve the user from THEIR token, using the anon key — never the service role. Asking
  // the service-role client to decode a user token would skip the check that the token is
  // currently valid.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json(401, { error: 'UNAUTHENTICATED' });
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Reuse an in-flight inquiry rather than minting a second one. Persona bills per inquiry
  // (the per-verification cost OQ-11 flags as unowned), and a user who backgrounds the app
  // mid-flow and returns would otherwise create a new one on every attempt.
  const { data: pending, error: pendingError } = await admin
    .from('verifications')
    .select('id, inquiry_id')
    .eq('user_id', userId)
    .eq('provider_status', 'pending')
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingError) {
    console.error(`create-inquiry: pending lookup failed — ${pendingError.message}`);
    return json(500, { error: 'LOOKUP_FAILED' });
  }

  if (pending?.inquiry_id) {
    // resume-path brief §2: session tokens are locked to the inquiry's expiry at the moment
    // they're minted, so the old `reused: true` shape with no token left the app unable to open
    // a server-created inquiry a second time. Mint one per call — never cache it in this row.
    const resumeRequest = buildResumeInquiryRequest({
      apiKey: personaApiKey,
      inquiryId: pending.inquiry_id,
    });

    const resumeResponse = await fetch(resumeRequest.url, {
      method: resumeRequest.method,
      headers: resumeRequest.headers,
      body: resumeRequest.body,
    });
    const resumeRawBody = await resumeResponse.text();
    const resumeOutcome = parseResumeInquiryResponse({
      status: resumeResponse.status,
      rawBody: resumeRawBody,
      rateLimitReset: resumeResponse.headers.get('RateLimit-Reset'),
    });

    if (!resumeOutcome.ok) {
      // Same discipline as the create-path failure log below: `.message`/`.detail` only, never
      // inquiry_id or user_id, both of which this branch holds.
      console.error(`create-inquiry: Persona resume failed — ${resumeOutcome.kind}: ${resumeOutcome.detail}`);
      switch (resumeOutcome.kind) {
        case 'unauthenticated':
          return json(401, { error: 'PERSONA_UNAUTHENTICATED' });
        case 'forbidden':
          return json(403, { error: 'PERSONA_FORBIDDEN' });
        case 'unprocessable':
          return json(422, { error: 'PERSONA_UNPROCESSABLE' });
        case 'rate_limited':
          return json(429, {
            error: 'PERSONA_RATE_LIMITED',
            ...(resumeOutcome.retryAfterSeconds !== undefined
              ? { retryAfterSeconds: resumeOutcome.retryAfterSeconds }
              : {}),
          });
        case 'missing_session_token':
        case 'malformed_response':
        case 'unexpected':
          // brief §5: do not fall back to creating a fresh inquiry here — that silently doubles
          // the per-verification cost against a fixed-price PRD (OQ-11).
          return json(502, { error: 'PERSONA_BAD_RESPONSE' });
      }
    }

    return json(200, {
      inquiryId: resumeOutcome.inquiryId,
      sessionToken: resumeOutcome.sessionToken,
      templateId,
      reused: true,
    });
  }

  // 🔴 min_age is the sharp edge of this whole endpoint. A Persona template that scans an ID
  // and matches a selfie but carries NO age requirement returns `approved` for a 14-year-old.
  // The age requirement itself is a dashboard checkbox and is verified there, not asserted
  // here — but WHICH template answered is enforced: `persona-webhook` refuses to honour a pass
  // from anything other than `PERSONA_TEMPLATE_ID` (`_shared/inquiryTemplate.ts`). This
  // function only ever opens inquiries against that one configured template id.

  // Brief §4.3: the Idempotency-Key must be stable per user PER ATTEMPT, not the bare user_id.
  // `attemptNumber` is every verifications row this user has ever had, read BEFORE this
  // attempt's row exists — see personaInquiry.ts's buildIdempotencyKey doc for why that makes
  // two concurrent requests for the same attempt collapse into one Persona call.
  const { count: attemptNumber, error: countError } = await admin
    .from('verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    console.error(`create-inquiry: attempt count failed — ${countError.message}`);
    return json(500, { error: 'LOOKUP_FAILED' });
  }

  const personaRequest = buildCreateInquiryRequest({
    apiKey: personaApiKey,
    templateId,
    idempotencyKey: buildIdempotencyKey(userId, attemptNumber ?? 0),
  });

  const personaResponse = await fetch(personaRequest.url, {
    method: personaRequest.method,
    headers: personaRequest.headers,
    body: personaRequest.body,
  });
  const personaRawBody = await personaResponse.text();
  const outcome = parseCreateInquiryResponse({
    status: personaResponse.status,
    rawBody: personaRawBody,
    rateLimitReset: personaResponse.headers.get('RateLimit-Reset'),
  });

  if (!outcome.ok) {
    // `outcome.detail` is a fixed, safe string per failure kind (see personaInquiry.ts) — never
    // the raw vendor body, and never inquiry_id/user_id (rule 1; neither exists yet on this path).
    console.error(`create-inquiry: Persona request failed — ${outcome.kind}: ${outcome.detail}`);
    switch (outcome.kind) {
      case 'unauthenticated':
        return json(401, { error: 'PERSONA_UNAUTHENTICATED' });
      case 'forbidden':
        return json(403, { error: 'PERSONA_FORBIDDEN' });
      case 'unprocessable':
        return json(422, { error: 'PERSONA_UNPROCESSABLE' });
      case 'rate_limited':
        return json(429, {
          error: 'PERSONA_RATE_LIMITED',
          ...(outcome.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: outcome.retryAfterSeconds }
            : {}),
        });
      case 'missing_session_token':
      case 'malformed_response':
      case 'unexpected':
        // §5: a 201 missing meta.session-token must fail loudly rather than write a row the
        // app can never resume. Same bucket as any other response shape we cannot trust.
        return json(502, { error: 'PERSONA_BAD_RESPONSE' });
    }
  }

  // §4.2: Persona was called FIRST (above); this is the second write. If it fails there is a
  // window where a live Persona inquiry exists with no row here — accepted knowingly: the
  // orphan is harmless (`persona-webhook` 404s on an unknown inquiry and writes nothing) at
  // the cost of one wasted billable inquiry, which beats the alternative of a half-written row
  // fighting the pending-reuse path above.
  const { error: insertError } = await admin.from('verifications').insert({
    user_id: userId,
    age_verified: false,
    method: 'persona-v1',
    inquiry_id: outcome.inquiryId,
    provider_status: 'pending',
    // app_version / platform are NOT NULL columns inherited from the deleted on-device flow
    // (§5.2.2), where the client held the verification result and reported what produced it.
    // The server-created-inquiry contract is a bodyless POST (spec §2.3: "create-inquiry {}"),
    // so there is no honest per-request value available here. Recorded as 'unknown' rather
    // than guessed — a schema change to make these nullable/optional is out of scope for this
    // task (brief §6, "do not restructure the function"); flagged in the PR body.
    app_version: 'unknown',
    platform: 'unknown',
  });

  if (insertError) {
    // §4.3: settles the concurrent-request race the Idempotency-Key only half-closes — see
    // `isConcurrentInquiryInsertRace`'s doc in personaInquiry.ts for why this is safe to treat
    // as a success rather than an error.
    if (isConcurrentInquiryInsertRace(insertError)) {
      const { data: winnerRow, error: winnerError } = await admin
        .from('verifications')
        .select('id')
        .eq('inquiry_id', outcome.inquiryId)
        .maybeSingle();

      if (winnerError || !winnerRow) {
        // Logged WITHOUT inquiry_id/user_id (§8.1), same as the branch below — this message is
        // a lookup failure, never the constraint's DETAIL line with the actual value in it.
        console.error(`create-inquiry: post-race row lookup failed — ${winnerError?.message ?? 'row missing after unique violation'}`);
        return json(500, { error: 'INSERT_FAILED' });
      }

      return json(201, { inquiryId: outcome.inquiryId, sessionToken: outcome.sessionToken, templateId });
    }

    // §4.2 / §8.1: logged WITHOUT inquiry_id and WITHOUT user_id, even though this function
    // holds both right here.
    console.error(`create-inquiry: insert failed after Persona inquiry creation — ${insertError.message}`);
    return json(500, { error: 'INSERT_FAILED' });
  }

  return json(201, { inquiryId: outcome.inquiryId, sessionToken: outcome.sessionToken, templateId });
});
