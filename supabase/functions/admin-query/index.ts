/**
 * `admin-query` — AD-1 M1a. Every admin READ goes through this function; M1a ships exactly one
 * action, `me`, to prove the gate. `users.list`, `users.search`, `users.detail`, `fleet.list`,
 * `auditlog.list` are M1b — deliberately not built here (see the M1a brief §1, "resist scope
 * creep").
 *
 * Deploy WITH JWT verification (the default; `verify_jwt = true` is explicit in `config.toml`
 * for the contrast with `persona-webhook`'s `verify_jwt = false`). Same "anon client to resolve
 * the user, service client to act" split as `issue-device-session`/`revoke-device-session`.
 *
 * 🔴 No Deno here to run or typecheck locally (`tsconfig.json` excludes `supabase/functions/**`).
 * This file is thin by design: every real decision — claim parsing, the aal2/`admin_users` gate,
 * audit-row shape — lives in `_shared/` and is Jest-tested there. This file is verified by
 * reading (see the M1a report §11) and, once deployed, by a live call with real tokens.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireAdmin, type AdminGateSupabaseClient } from '../_shared/requireAdmin.ts';
import { writeAdminAudit, type AuditSupabaseClient } from '../_shared/adminAudit.ts';
import { corsHeaders, handlePreflight, parseAllowedOrigins } from '../_shared/adminCors.ts';

function json(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

interface RequestBody {
  action?: unknown;
  payload?: { requestId?: unknown } & Record<string, unknown>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const allowedOrigins = parseAllowedOrigins(Deno.env.get('ADMIN_PANEL_ORIGINS'));

  // Step 0: preflight, before anything else — a browser sends OPTIONS with no Authorization
  // header at all, so this must not fall through to the auth gate.
  const preflight = handlePreflight(req, allowedOrigins);
  if (preflight !== null) {
    return preflight;
  }

  const cors = corsHeaders(req.headers.get('Origin'), allowedOrigins);

  if (req.method !== 'POST') {
    return json(405, { error: 'METHOD_NOT_ALLOWED' }, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('admin-query: incomplete environment configuration');
    return json(500, { error: 'NOT_CONFIGURED' }, cors);
  }

  // §3 Path B: only an explicit REQUIRE_ADMIN_MFA=false secret relaxes the aal2 check. The
  // admin_users membership check inside requireAdmin is never gated by this flag.
  const requireMfa = Deno.env.get('REQUIRE_ADMIN_MFA') !== 'false';

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: 'MALFORMED_BODY' }, cors);
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (action.length === 0) {
    return json(400, { error: 'MISSING_ACTION' }, cors);
  }

  const requestId =
    typeof body.payload?.requestId === 'string'
      ? body.payload.requestId
      : req.headers.get('x-request-id') ?? undefined;

  const authHeader = req.headers.get('Authorization');
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false },
  }) as unknown as AdminGateSupabaseClient;
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  }) as unknown as AdminGateSupabaseClient & AuditSupabaseClient;

  const gate = await requireAdmin({ authorizationHeader: authHeader, anonClient, serviceClient, requireMfa });

  if (!gate.ok) {
    if (gate.loggableUserId !== null) {
      await writeAdminAudit(serviceClient, {
        actorAdminId: gate.loggableUserId,
        action,
        outcome: 'denied',
        requestId,
      });
    }
    return json(gate.status, { error: gate.code }, cors);
  }

  switch (action) {
    case 'me': {
      await writeAdminAudit(serviceClient, {
        actorAdminId: gate.userId,
        action: 'me',
        outcome: 'ok',
        requestId,
      });
      const { data: userData } = await anonClient.auth.getUser();
      return json(
        200,
        {
          userId: gate.userId,
          email: userData.user?.email ?? null,
          role: gate.admin.role,
          disabled: false,
        },
        cors,
      );
    }
    default: {
      await writeAdminAudit(serviceClient, {
        actorAdminId: gate.userId,
        action,
        outcome: 'denied',
        requestId,
      });
      return json(400, { error: 'UNKNOWN_ACTION' }, cors);
    }
  }
});
