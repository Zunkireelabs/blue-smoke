import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/shared/lib/supabaseClient';
import { useSessionStore } from '@/app/stores/useSessionStore';

/**
 * Reads back the verification outcome the webhook wrote (spec §5.2.2, §6).
 *
 * This is the missing half of P2-1.0. `PersonaVerificationScreen` correctly treats the SDK's
 * `onComplete` as a UI hint and parks on "Confirming your verification…", but nothing was
 * ever resolving that wait — the vendor's decision arrives out-of-band at `persona-webhook`,
 * not through the SDK callback. This hook is what turns that screen's pending state into an
 * answer.
 *
 * ── 🔴 This is a UX HINT, NOT AN AUTHORITY (CLAUDE.md rule 3) ─────────────────────────
 *
 * It reads server state rather than trusting the client, which is better than a local
 * boolean — but "better" is not "authoritative". A rooted device can return whatever it
 * likes from this call. Nothing privileged may depend on it. The real gate is server-side in
 * `issue-device-session` (§5.4 step 2), which re-reads this table before releasing any key
 * material and does not care what the app believes.
 *
 * Use this ONLY to decide which screen to show. Never to decide whether an action is allowed.
 *
 * ── Why polling, and why it stops ─────────────────────────────────────────────────────
 *
 * The webhook lands whenever Persona decides, which may be seconds or minutes, and there is
 * no push channel to the app yet (§5.5 covers push, unbuilt). So the app polls, and stops
 * only at `verified` — the one state that never changes again. See `nextPollInterval`.
 */
export type VerificationState =
  /** Still fetching — say nothing to the user yet. */
  | 'loading'
  /** No verification has ever been started for this account. */
  | 'none'
  /** Submitted; the vendor has not returned a terminal decision yet. */
  | 'pending'
  /** The webhook recorded a pass. Still only a hint — see the note above. */
  | 'verified'
  /** The vendor declined, or the inquiry failed or expired. */
  | 'declined'
  /**
   * The read itself failed (network, RLS, transport) — we do not know the answer, which is a
   * different thing from 'none'. F6.X / VF-7: before this state existed, a query error with no
   * cached data fell through to `data ?? 'none'` and sent the user into an ID scan, including a
   * verified user whose very first read of this session happened to fail. Only reachable when
   * there is no cached data at all (see `useVerificationStatus` below) — an error on a
   * background refetch never overrides a last-known-good state.
   */
  | 'error';

const POLL_INTERVAL_MS = 5_000;

/**
 * Every query for this hook, for any user. Deliberately a PREFIX, not a full key: callers that
 * want to force a re-read (`PersonaVerificationScreen`) know an outcome may have landed, but
 * have no business assembling the signed-in user's id into a cache key to say so.
 */
export const VERIFICATION_STATUS_QUERY_PREFIX = ['verification-status'] as const;

/**
 * How long until the next read, given what the last one returned.
 *
 * 🔴 The rule is "stop at `verified`", NOT "stop at any terminal-looking state" — that reading
 * is what caused the stuck-screen bug fixed here (2026-09-10), where testers sat on "Confirming
 * your verification…" indefinitely while Persona's dashboard already showed a pass, and only a
 * force-quit (which remounts the hook and forces a fresh read) let them through.
 *
 * The hook mounts once, at sign-in, which is BEFORE the user has started the Persona flow. The
 * first read therefore resolves to 'none' — no row exists yet. Treating 'none' as a state that
 * stops polling froze the query there for the rest of the session: `create-inquiry` then wrote
 * the pending row and the webhook wrote the pass, and the app never looked again.
 *
 * So the states are read as "can this still change?", and only one cannot:
 *   - 'none'      — a row appears the moment `create-inquiry` runs. CHANGES.
 *   - 'pending'   — waiting on exactly the webhook we are polling for. CHANGES.
 *   - 'declined'  — a user may retry, which moves the same row back to pending. CHANGES.
 *                   (`navigation.tsx` routes 'declined' straight back into the Persona flow,
 *                   so this is the ordinary path, not an edge case.)
 *   - undefined   — the read itself failed, so we know nothing. Retrying is the point.
 *   - 'verified'  — the webhook wrote a pass. Nothing revokes it in-session. STOP.
 *
 * Polling a non-verified signed-in user costs one indexed single-row read every 5s, and only
 * while they sit on a verification screen — every other stack is gated behind 'verified', so
 * this cannot run in the background of normal app use.
 */
export function nextPollInterval(state: VerificationState | undefined): number | false {
  return state === 'verified' ? false : POLL_INTERVAL_MS;
}

interface VerificationRow {
  age_verified: boolean;
  provider_status: string | null;
}

function toState(row: VerificationRow | null): VerificationState {
  if (!row) {
    return 'none';
  }
  if (row.age_verified) {
    return 'verified';
  }
  // `pending` is the row create-inquiry writes before the vendor decides. A null status is
  // treated the same way: an outcome we do not have yet is never a pass.
  if (row.provider_status === null || row.provider_status === 'pending') {
    return 'pending';
  }
  return 'declined';
}

export function useVerificationStatus() {
  const userId = useSessionStore((s) => s.user?.id ?? null);

  const query = useQuery({
    queryKey: [...VERIFICATION_STATUS_QUERY_PREFIX, userId],
    // Disabled while signed out: without a session RLS returns nothing, and an empty result
    // would be indistinguishable from "never verified".
    enabled: userId !== null,
    refetchInterval: (q) => nextPollInterval(q.state.data),
    queryFn: async (): Promise<VerificationState> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('verifications')
        // Deliberately NOT selecting inquiry_id. The app has no use for it, and pulling it
        // into client memory next to the signed-in user is exactly the pairing rule 1
        // prohibits. Ask only for what decides the screen.
        .select('age_verified, provider_status')
        .order('verified_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return toState(data as VerificationRow | null);
    },
  });

  // Cached data always wins over a concurrent error: once any successful read has landed
  // (verified/pending/declined/none), a later background refetch failing must not evict it —
  // only the FIRST read, before any data exists, can ever produce 'error'. That is what keeps
  // a transient network blip from bouncing an already-verified user into VF-7, let alone VF-2.
  const state: VerificationState = query.isPending
    ? 'loading'
    : query.data !== undefined
      ? query.data
      : query.isError
        ? 'error'
        : 'none';

  return {
    state,
    /**
     * Surfaced so the caller can offer a retry. Errors here are transport failures, never a
     * verification decision — a failed fetch must never be rendered as "declined".
     */
    error: query.error,
    refetch: query.refetch,
  };
}
