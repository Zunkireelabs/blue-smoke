/**
 * Admin audit writer — AD-1 M1a execution brief §8.
 *
 * Every admin-* Edge Function call writes exactly one `admin_audit_log` row, including denied
 * attempts by a valid non-admin JWT (§4 rule from `TODO-AD-1-admin-panel.md`). `buildAuditRow` is
 * the pure validate-and-scrub step, unit-tested exhaustively; `writeAdminAudit` is the thin
 * insert, matching the pure/thin split the rest of `_shared/` uses.
 *
 * ── Why `buildAuditRow` REJECTS instead of silently scrubbing ────────────────────────────────
 * A caller that tried to put `inquiry_id` in `metadata` has a bug worth surfacing loudly — a
 * silently-dropped key would let that bug ship invisibly. Rejecting the whole entry (never
 * writing a row for it, just a console.error) makes the failure visible in logs instead of
 * papering over a rule-3-adjacent mistake with a quieter audit row.
 */

export interface AdminAuditEntry {
  actorAdminId: string;
  action: string;
  outcome: 'ok' | 'denied' | 'error';
  targetUserId?: string;
  targetDeviceId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/** Matches a metadata KEY that must never appear, at any depth: `inquiry_id`/`inquiryId`/etc.,
 * or dob/selfie/embedding/similarity. Mirrors `web-admin`'s client-side `FORBIDDEN_KEY` guard. */
const FORBIDDEN_KEY_PATTERN = /inquiry.?id|\bdob\b|selfie|embedding|similarity/i;

/**
 * Walks `metadata` looking for a forbidden KEY at any depth. Deliberately keys only, not values —
 * see the brief §8: the string `'inquiry_id'` appearing as a VALUE (e.g. `{ note: 'inquiry_id' }`)
 * is not itself the leak (it's not an actual identifier), so it is not what this function rejects.
 * The brief flags this as a documented choice, not an oversight — being conservative on keys is
 * enough to catch the realistic bug (an id accidentally assigned to a key), and rejecting every
 * value that merely contains the substring "inquiry_id" would make ordinary text metadata
 * (e.g. an error message mentioning the concept) fail unpredictably.
 */
function hasForbiddenKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenKey(item));
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      return true;
    }
    if (hasForbiddenKey(nested)) {
      return true;
    }
  }
  return false;
}

/** Pure: validates the entry and rejects it outright if `metadata` carries a forbidden key.
 * Never throws. */
export function buildAuditRow(
  entry: AdminAuditEntry,
): { ok: true; row: Record<string, unknown> } | { ok: false; reason: string } {
  if (!entry.actorAdminId) {
    return { ok: false, reason: 'actorAdminId is required' };
  }
  if (!entry.action) {
    return { ok: false, reason: 'action is required' };
  }
  if (entry.outcome !== 'ok' && entry.outcome !== 'denied' && entry.outcome !== 'error') {
    return { ok: false, reason: `invalid outcome: ${String(entry.outcome)}` };
  }

  if (entry.metadata !== undefined && hasForbiddenKey(entry.metadata)) {
    return { ok: false, reason: 'metadata contains a forbidden key (inquiry_id/dob/selfie/embedding/similarity)' };
  }

  const row: Record<string, unknown> = {
    actor_admin_id: entry.actorAdminId,
    action: entry.action,
    outcome: entry.outcome,
    target_user_id: entry.targetUserId ?? null,
    target_device_id: entry.targetDeviceId ?? null,
    metadata: entry.metadata ?? null,
    request_id: entry.requestId ?? null,
  };

  return { ok: true, row };
}

/** Minimal shape this module needs from `@supabase/supabase-js`'s client. */
export interface AuditSupabaseClient {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: unknown }>;
  };
}

/**
 * Thin: `buildAuditRow` + insert. Swallows insert errors to `console.error` — a failed audit
 * write must not turn a successful admin read into a 500, but it must be loud (§8).
 */
export async function writeAdminAudit(serviceClient: AuditSupabaseClient, entry: AdminAuditEntry): Promise<void> {
  const built = buildAuditRow(entry);
  if (!built.ok) {
    console.error(`writeAdminAudit: refusing to write invalid audit entry — ${built.reason}`);
    return;
  }

  const { error } = await serviceClient.from('admin_audit_log').insert(built.row);
  if (error) {
    console.error(`writeAdminAudit: insert failed — ${JSON.stringify(error)}`);
  }
}
