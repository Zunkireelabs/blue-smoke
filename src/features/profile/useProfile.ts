import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/shared/lib/supabaseClient';
import { useSessionStore } from '@/app/stores/useSessionStore';

/**
 * P1-8.0 — the account details behind the Profile screen.
 *
 * Two reads, deliberately kept apart from the session store: `useSessionStore` mirrors
 * `supabase.auth` and knows the identifier someone signed in with, but `display_name` and
 * `created_at` live in `public.profiles`, and the verification date lives in
 * `public.verifications`. Both are RLS-scoped to `auth.uid()` (`own_profile`,
 * `read_own_verifications`), so a second user's JWT returns nothing rather than someone
 * else's row.
 *
 * ── 🔴 What is deliberately NOT selected (CLAUDE.md rule 1) ───────────────────────────
 *
 * `inquiry_id` is never fetched. The same reasoning as `useVerificationStatus`: the app has
 * no use for the vendor's handle, and pulling it into client memory alongside a name and an
 * email is precisely the re-identifying pairing rule 1 prohibits. `provider_status` is not
 * fetched either — the screen shows verified/not and a date, never the vendor's verbatim
 * decision string, which would be diagnostic rather than coaching.
 *
 * DOB is not fetched because we never had one to fetch. Since v1.5 the vendor owns the
 * document; `age_verified` is a boolean outcome and there is no date of birth in our schema.
 */

export interface ProfileDetails {
  /** `profiles.display_name` — null until the user sets one. */
  displayName: string | null;
  /** `profiles.created_at` — "member since". */
  memberSince: string | null;
  /** Whether the webhook has recorded a pass. A UX hint, never an authority (rule 3). */
  ageVerified: boolean;
  /** `verifications.verified_at` for the row above; null when never verified. */
  verifiedAt: string | null;
}

interface ProfileRow {
  display_name: string | null;
  created_at: string;
}

interface VerificationDateRow {
  age_verified: boolean;
  verified_at: string;
}

export function useProfile() {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['profile', userId];

  const query = useQuery({
    queryKey,
    // Same reasoning as useVerificationStatus: without a session RLS returns nothing, and an
    // empty result would be indistinguishable from "no profile row".
    enabled: userId !== null,
    queryFn: async (): Promise<ProfileDetails> => {
      const supabase = getSupabaseClient();

      const [profileResult, verificationResult] = await Promise.all([
        supabase.from('profiles').select('display_name, created_at').maybeSingle(),
        supabase
          .from('verifications')
          .select('age_verified, verified_at')
          .order('verified_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }
      if (verificationResult.error) {
        throw verificationResult.error;
      }

      const profile = profileResult.data as ProfileRow | null;
      const verification = verificationResult.data as VerificationDateRow | null;

      return {
        displayName: profile?.display_name ?? null,
        memberSince: profile?.created_at ?? null,
        ageVerified: verification?.age_verified ?? false,
        // Only meaningful when the row is a pass — `verified_at` defaults to now() on insert,
        // so a pending or declined row carries a date that would read as "verified on X".
        verifiedAt: verification?.age_verified ? verification.verified_at : null,
      };
    },
  });

  const updateDisplayName = useMutation({
    mutationFn: async (displayName: string): Promise<void> => {
      if (userId === null) {
        throw new Error('Not signed in');
      }
      const supabase = getSupabaseClient();
      const trimmed = displayName.trim();
      const { error } = await supabase
        .from('profiles')
        // Upsert rather than update: `ensureProfileRow` runs on signup, but accounts created
        // before it existed have no row, and an update against no row succeeds silently
        // having changed nothing.
        .upsert({ id: userId, display_name: trimmed === '' ? null : trimmed }, { onConflict: 'id' });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isPending && userId !== null,
    error: query.error,
    refetch: query.refetch,
    updateDisplayName,
  };
}
