import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
  Sheet,
  Text,
  TextField,
  tokens,
  type Tone,
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
 * ── Information architecture (UI-refinements pass) ──────────────────────────────────────
 *
 * Grouped by what a user is trying to do, not by database table: an identity header (who am I /
 * how do I sign in — the one editable fact lives here) plus one grouped card for everything else
 * (verification, member since, security, and Log out as its last, visually distinct — red icon +
 * red label — row). `SettingsRow` below is a local, unexported layout helper for this screen's
 * flat rows — deliberately not promoted to `src/shared/ui` (a contested shared file) without a
 * reason for other screens to need it too.
 *
 * ── Security is gated on having an email ────────────────────────────────────────────────
 *
 * The Security section renders only when `user?.email` is truthy. A phone-only account must not
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);

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

  const identifier = accountIdentifier(user?.email, user?.phone);
  const avatarInitial = (profile?.displayName?.trim() || identifier).charAt(0).toUpperCase();

  return (
    <Screen scroll centered={false} style={styles.screen}>
      <Card style={styles.groupCard}>
        <View style={styles.identityHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter} tone="inverse">
              {avatarInitial}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text variant="body" style={styles.name} numberOfLines={1}>
              {profile?.displayName || 'Add a display name'}
            </Text>
            <Text variant="caption" tone="secondary" style={styles.description} numberOfLines={1}>
              {identifier}
            </Text>
          </View>
        </View>

        <SettingsRow
          label="Display name"
          description={profile?.displayName || 'Not set'}
          icon={<PersonIcon />}
          trailing={
            <Text variant="body" tone="secondary">
              {isEditingName ? '⌄' : '›'}
            </Text>
          }
          onPress={() => {
            if (isEditingName) {
              // Closing without a fresh save discards the draft, same as never having opened
              // the editor — the field re-seeds from the last saved value.
              setDraftName(profile?.displayName ?? '');
              setSaved(false);
            }
            setIsEditingName((v) => !v);
          }}
        />

        {isEditingName && (
          <View style={styles.editBlock}>
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
          </View>
        )}
      </Card>

      <Card style={styles.groupCard}>
        <SettingsRow
          label="Age verification"
          description={
            profile?.ageVerified && profile.verifiedAt !== null
              ? `Verified on ${formatDate(profile.verifiedAt)}`
              : undefined
          }
          icon={<ShieldIcon />}
          trailing={
            // Verified/not and a date — never a score, a vendor status string, or a DOB.
            <Badge
              label={profile?.ageVerified ? 'Verified' : 'Not verified'}
              tone={profile?.ageVerified ? 'success' : 'neutral'}
            />
          }
        />
        <SettingsRow
          label="Member since"
          icon={<CalendarIcon />}
          trailing={
            <Text variant="body" tone="secondary">
              {profile?.memberSince === null || profile?.memberSince === undefined
                ? 'Unknown'
                : formatDate(profile.memberSince)}
            </Text>
          }
        />
        {user?.email && (
          // Always "Set a password", never "Change password" — reviewed twice, intentional
          // both times. Nothing distinguishes an account that already has one: `app_metadata`,
          // `user_metadata` and `auth.identities` are byte-identical before and after setting
          // a password (measured 2026-08-11), and every `auth.users` row carries a bcrypt hash
          // regardless, including phone-only accounts that have never seen a password field.
          // Accurate labelling would need a `has_password` column we deliberately did not add;
          // `setPassword` is idempotent, so one label serves both cases. See
          // `SetPasswordScreen.tsx` for the full reasoning.
          <SettingsRow
            label="Set a password"
            icon={<LockIcon />}
            trailing={
              <Text variant="body" tone="secondary">
                ›
              </Text>
            }
            onPress={() => navigation.navigate('SetPassword')}
          />
        )}
        <SettingsRow
          label="Log out"
          icon={<LogoutIcon />}
          labelTone="danger"
          onPress={() => setIsLogoutConfirmVisible(true)}
        />
      </Card>

      <Sheet
        visible={isLogoutConfirmVisible}
        onClose={() => setIsLogoutConfirmVisible(false)}
        position="center"
      >
        <Text variant="title" style={styles.sheetHeading}>
          Log out?
        </Text>
        <Text variant="body" tone="secondary" style={styles.sheetBody}>
          You'll need to sign in again to use your account.
        </Text>
        <View style={styles.sheetActions}>
          <View style={styles.sheetActionButton}>
            <Button
              label="Log out"
              variant="destructive"
              onPress={() => {
                setIsLogoutConfirmVisible(false);
                // Fire-and-forget: the session store's onAuthStateChange listener drives the UI
                // back to the auth stack, so there is nothing to await here.
                authClient.signOut().catch(() => {});
              }}
            />
          </View>
          <View style={styles.sheetActionButton}>
            <Button label="Cancel" variant="secondary" onPress={() => setIsLogoutConfirmVisible(false)} />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** `'danger'` for the one destructive/session-ending row (Log out) — plain text otherwise. */
  labelTone?: Tone;
}

/**
 * A flat, divided settings row — no background box of its own, so several can sit inside one
 * `Card` as a single grouped surface instead of each field getting its own card. Renders as a
 * plain (non-pressable) row when `onPress` is omitted, so read-only facts never carry the
 * button affordance interactive rows have.
 */
function SettingsRow({ label, description, icon, trailing, onPress, labelTone }: SettingsRowProps) {
  const content = (
    <View style={styles.row}>
      {icon && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowText}>
        <Text variant="body" tone={labelTone} style={styles.rowLabel}>
          {label}
        </Text>
        {description && (
          <Text variant="caption" tone="secondary" style={styles.rowDescription}>
            {description}
          </Text>
        )}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

const ICON_SIZE = 20;
const ICON_STROKE = 1.75;
const AVATAR_SIZE = 40;

// Hand-drawn inline, same convention as `HomeScreen.tsx`'s glyphs — no icon set exists yet in
// this codebase, so a one-off SVG per row is the established pattern rather than a new
// dependency for four glyphs.
function PersonIcon() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={tokens.color.textPrimary} strokeWidth={ICON_STROKE} />
      <Path
        d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6"
        stroke={tokens.color.textPrimary}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z"
        stroke={tokens.color.textPrimary}
        strokeWidth={ICON_STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M9 12l2 2 4-4"
        stroke={tokens.color.textPrimary}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={15} rx={2} stroke={tokens.color.textPrimary} strokeWidth={ICON_STROKE} />
      <Line x1={4} y1={9} x2={20} y2={9} stroke={tokens.color.textPrimary} strokeWidth={ICON_STROKE} />
      <Line x1={8} y1={3} x2={8} y2={7} stroke={tokens.color.textPrimary} strokeWidth={ICON_STROKE} strokeLinecap="round" />
      <Line x1={16} y1={3} x2={16} y2={7} stroke={tokens.color.textPrimary} strokeWidth={ICON_STROKE} strokeLinecap="round" />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={14} height={9} rx={2} stroke={tokens.color.textPrimary} strokeWidth={ICON_STROKE} />
      <Path
        d="M8 11V8a4 4 0 018 0v3"
        stroke={tokens.color.textPrimary}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Colored `dangerText` rather than a tinted backdrop, so it reads as red the same way the
// "Log out" label does — no colored circle behind it.
function LogoutIcon() {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3"
        stroke={tokens.color.dangerText}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M16 8l4 4-4 4"
        stroke={tokens.color.dangerText}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={10} y1={12} x2={20} y2={12} stroke={tokens.color.dangerText} strokeWidth={ICON_STROKE} strokeLinecap="round" />
    </Svg>
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
  screen: {
    gap: tokens.spacing.lg,
    backgroundColor: tokens.color.background,
    paddingHorizontal: tokens.spacing.md,
  },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: tokens.typography.fontSize.body,
    fontWeight: tokens.typography.fontWeight.semibold,
  },
  identityText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  name: {
    fontSize: 20,
    fontWeight: tokens.typography.fontWeight.medium,
  },
  description: {
    fontSize: 13,
  },
  editBlock: {
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
  },
  groupCard: {
    padding: 0,
    // Exact value requested for this screen. It had no `tokens.color.*` entry, so one was added
    // (`surfaceSubtle`, backed by `neutral[75]`) rather than kept as a local literal — this file
    // IS scanned by `tokenOnlyGuard`, which lists it in `RESTYLED_SCREENS`.
    backgroundColor: tokens.color.surfaceSubtle,
    borderWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    minHeight: tokens.touchTarget.minHeight,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    // Matches `avatar`'s width so every row's label text lands on the same left edge as the
    // identity header's name, regardless of whether the leading element is the 40px avatar or
    // a smaller 20px glyph — the glyph just centers within the same-width column.
    width: AVATAR_SIZE,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: tokens.typography.fontWeight.medium,
  },
  rowDescription: {
    fontSize: 13,
    marginTop: 0,
  },
  sheetHeading: {
    marginBottom: tokens.spacing.sm,
  },
  sheetBody: {
    marginBottom: tokens.spacing.lg,
  },
  sheetActions: {
    flexDirection: 'row',
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  sheetActionButton: {
    flex: 1,
  },
});
