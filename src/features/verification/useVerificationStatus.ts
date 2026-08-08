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
 * no push channel to the app yet (§5.5 covers push, unbuilt). So the app polls, but only
 * while an outcome is genuinely outstanding: `refetchInterval` returns false the moment the
 * state is terminal, so a verified user is not polling the database every few seconds for
 * the life of the session.
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
  | 'declined';

const POLL_INTERVAL_MS = 5_000;

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
    queryKey: ['verification-status', userId],
    // Disabled while signed out: without a session RLS returns nothing, and an empty result
    // would be indistinguishable from "never verified".
    enabled: userId !== null,
    refetchInterval: (q) => (q.state.data === 'pending' ? POLL_INTERVAL_MS : false),
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

  return {
    state: query.isPending ? ('loading' as const) : (query.data ?? 'none'),
    /**
     * Surfaced so the caller can offer a retry. Errors here are transport failures, never a
     * verification decision — a failed fetch must never be rendered as "declined".
     */
    error: query.error,
    refetch: query.refetch,
  };
}
