import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  Text,
  TextField,
  tokens,
} from '@/shared/ui';
import { useAuthClient } from '@/features/auth/AuthClientContext';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { accountIdentifier } from '@/shared/lib/accountIdentifier';
import type { RootStackParamList } from '@/app/navigation';
import { useProfile } from './useProfile';

/**
 * P1-8.0 — Profile & Settings.
 *
 * ── Scope: this is PART of P1-8.0, not all of it ──────────────────────────────────────
 *
 * Built here: account details (identifier, display name, member since), verification status
 * with its date, a Security section (P1-1.0 PR 2 — "Set a password", PF-8), and sign-out.
 *
 * ── Security is gated on having an email ────────────────────────────────────────────────
 *
 * The Security card renders only when `user?.email` is truthy. A phone-only account must not
 * see "Set a password": `signInWithEmail` needs an email, so the row would be a dead end for
 * that account.
 *
 * 🔴 **Truthiness is the point, not a null check.** A phone-only account's `email` is the
 * EMPTY STRING, not null — measured against `bluesmoke-dev` 2026-08-11. So `user?.email !== null`
 * would be TRUE for exactly the accounts this gate must exclude. Do not "clarify" this into an
 * explicit null comparison; `ProfileScreen.test.tsx` mutation-tests that refactor and fails it. `signInWithPassword({ phone, password })` does work (verified live against
 * `bluesmoke-dev`), but wiring phone + password removes the SMS-possession factor from phone
 * auth — a deliberate, separate product decision, out of scope here.
 *
 * Four sub-tasks in TODO-phase-1.md remain deliberately unbuilt
 * because each needs a value that does not exist yet, and CLAUDE.md forbids inventing one:
 *
 *   - Support contact link — blocked on OQ-2 (manual-review fallback: owner, channel, SLA).
 *   - Privacy policy + terms links — no URLs exist in the repo or the spec.
 *   - App version + build number — needs a new dependency; package.json is a contested
 *     shared file requiring the announcement first.
 *   - Notification preferences — `push_tokens` exists but has no client code; §5.5 is unbuilt.
 *
 * The "plain-language explanation of the privacy model" sub-task is also left out on purpose:
 * its TODO text still says *on-device*, which v1.5 made false — capture moved into Persona's
 * SDK. That copy needs rewriting against the current architecture before it is worth building.
 *
 * ── 🔴 Verification status shown here is a HINT (CLAUDE.md rule 3) ─────────────────────
 *
 * Same caveat as `useVerificationStatus`: this renders what the webhook wrote, which is server
 * state rather than a client boolean, but it is still only for display. No privileged action
 * may key off it — `issue-device-session` re-reads the table server-side and is the authority.
 */
export function ProfileScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSessionStore((s) => s.user);
  const { profile, isLoading, error, refetch, updateDisplayName } = useProfile();

  const [draftName, setDraftName] = useState('');
  const [saved, setSaved] = useState(false);

  // Seed the field once the row arrives. Keyed on the fetched value rather than running on
  // every render so it does not clobber what the user is currently typing.
  useEffect(() => {
    setDraftName(profile?.displayName ?? '');
  }, [profile?.displayName]);

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Loading your account…" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <ErrorState
          title="We couldn't load your account"
          body="Check your connection and try again."
          onRetry={() => {
            // Fire-and-forget, same idiom as sign-out below: the query's own error state
            // drives what renders next, so there is nothing to await here.
            refetch().catch(() => {});
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll centered={false} style={styles.screen}>
      <Card style={styles.card}>
        <Text variant="label" tone="secondary">
          Signed in as
        </Text>
        <Text variant="body">{accountIdentifier(user?.email, user?.phone)}</Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="label" tone="secondary">
          Display name
        </Text>
        <TextField
          accessibilityLabel="Display name"
          value={draftName}
          onChangeText={(next) => {
            setDraftName(next);
            setSaved(false);
          }}
          placeholder="Add a display name"
          autoCapitalize="words"
          error={updateDisplayName.isError ? "We couldn't save that. Try again." : undefined}
        />
        <Button
          label={saved ? 'Saved' : 'Save'}
          loading={updateDisplayName.isPending}
          disabled={draftName.trim() === (profile?.displayName ?? '')}
          onPress={() => {
            updateDisplayName.mutate(draftName, { onSuccess: () => setSaved(true) });
          }}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="label" tone="secondary">
          Age verification
        </Text>
        {/* Verified/not and a date — never a score, a vendor status string, or a DOB. */}
        <Badge
          label={profile?.ageVerified ? 'Verified' : 'Not verified'}
          tone={profile?.ageVerified ? 'success' : 'neutral'}
        />
        {profile?.ageVerified && profile.verifiedAt !== null && (
          <Text variant="caption" tone="secondary">
            {`Verified on ${formatDate(profile.verifiedAt)}`}
          </Text>
        )}
      </Card>

      <Card style={styles.card}>
        <Text variant="label" tone="secondary">
          Member since
        </Text>
        <Text variant="body">
          {profile?.memberSince === null || profile?.memberSince === undefined
            ? 'Unknown'
            : formatDate(profile.memberSince)}
        </Text>
      </Card>

      {user?.email && (
        <Card style={styles.card}>
          <Text variant="label" tone="secondary">
            Security
          </Text>
          {/*
            Always "Set a password", never "Change password" — reviewed twice, intentional
            both times. Nothing distinguishes an account that already has one: `app_metadata`,
            `user_metadata` and `auth.identities` are byte-identical before and after setting
            a password (measured 2026-08-11), and every `auth.users` row carries a bcrypt hash
            regardless, including phone-only accounts that have never seen a password field.
            Accurate labelling would need a `has_password` column we deliberately did not add;
            `setPassword` is idempotent, so one label serves both cases. See
            `SetPasswordScreen.tsx` for the full reasoning.
          */}
          <ListRow label="Set a password" onPress={() => navigation.navigate('SetPassword')} />
        </Card>
      )}

      <View style={styles.signOut}>
        <Button
          label="Sign out"
          variant="secondary"
          onPress={() => {
            // Fire-and-forget: the session store's onAuthStateChange listener drives the UI
            // back to the auth stack, so there is nothing to await here.
            authClient.signOut().catch(() => {});
          }}
        />
      </View>
    </Screen>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  screen: { gap: tokens.spacing.lg },
  card: { gap: tokens.spacing.sm },
  signOut: { marginTop: tokens.spacing.md },
});
