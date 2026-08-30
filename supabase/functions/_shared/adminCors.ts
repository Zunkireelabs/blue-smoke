/**
 * CORS for the admin-* Edge Functions — AD-1 M1a execution brief §8.
 *
 * The `web-admin` SPA calls these functions from a browser on a DIFFERENT origin than the
 * Supabase project's own URL, so preflight matters here in a way it never did for the RN app's
 * functions (a native app has no CORS concept). Allowed origins come from the
 * `ADMIN_PANEL_ORIGINS` Edge Function secret — a comma-separated list, e.g.
 * `https://admin.bluesmoke.app,http://localhost:5173`.
 *
 * Never `Access-Control-Allow-Origin: *` — the request origin is echoed back ONLY if it is in the
 * allowlist. An unrecognised or absent origin gets no ACAO header at all, which is what makes the
 * browser enforce the block; a `null` origin (e.g. a sandboxed iframe, a file:// page) is treated
 * the same as any other unrecognised origin — never allowed by default.
 *
 * ── Deviation from the brief's literal signature (documented in the M1a report) ────────────────
 * The brief sketches `corsHeaders(requestOrigin)` reading `ADMIN_PANEL_ORIGINS` internally via
 * `Deno.env.get`. Every other `_shared/` module is deliberately Deno-import-free so Jest can run
 * it directly in Node — there is no `Deno` global shim in this project's test setup, and adding
 * one just for this file would be new test infrastructure for no benefit. Instead,
 * `parseAllowedOrigins` takes the raw env string as a parameter; `index.ts` (which does run under
 * Deno) is the only place that calls `Deno.env.get('ADMIN_PANEL_ORIGINS')` and passes the result
 * in. Same runtime-agnostic / thin-index.ts split every other file here uses.
 */

/** Parses the comma-separated `ADMIN_PANEL_ORIGINS` value into a trimmed, non-empty list. */
export function parseAllowedOrigins(rawEnvValue: string | undefined): string[] {
  return (rawEnvValue ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Allowed origins passed in explicitly (see the deviation note above) — `index.ts` reads
 * `Deno.env.get('ADMIN_PANEL_ORIGINS')` once per request and passes it through.
 */
export function corsHeaders(requestOrigin: string | null, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  };

  if (requestOrigin !== null && allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  }

  return headers;
}

/** If the method is OPTIONS, returns a 204 preflight Response with CORS headers; otherwise null. */
export function handlePreflight(req: Request, allowedOrigins: string[]): Response | null {
  if (req.method !== 'OPTIONS') {
    return null;
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('Origin'), allowedOrigins),
  });
}
