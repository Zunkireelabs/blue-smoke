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

  if (!supabaseUrl || !anonKey || !serviceKey || !templateId) {
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
    return json(200, { inquiryId: pending.inquiry_id, templateId, reused: true });
  }

  // ⚠️ NOT YET IMPLEMENTED, DELIBERATELY — spec §6.6.
  // Server-side inquiry creation requires a call to Persona's API with a secret API key, and
  // the exact request shape, the `reference-id` convention that links an inquiry back to a
  // user, and the `min_age` enforcement point are all listed in §6.6 as things not to guess.
  // Returning 501 rather than a plausible-looking stub keeps the gap visible: a stub that
  // returned a fabricated inquiry id would let the app appear to work while verifying nobody.
  //
  // 🔴 min_age is the sharp edge here. A Persona template that scans an ID and matches a
  // selfie but carries NO age requirement returns `approved` for a 14-year-old. No code in
  // this repo can detect that — it is template configuration, so it must be verified in the
  // Persona dashboard, not asserted here.
  console.error('create-inquiry: server-side inquiry creation not implemented (spec §6.6)');
  return json(501, {
    error: 'NOT_IMPLEMENTED',
    detail: 'Server-side inquiry creation is pending spec §6.6 — see P2-8.0.',
  });
});
