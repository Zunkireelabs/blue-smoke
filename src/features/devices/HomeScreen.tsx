import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';
import { CurtainGround, EmptyState, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { accountIdentifier } from '@/shared/lib/accountIdentifier';
import { BluetoothPrimingBody } from '@/features/onboarding/BluetoothPrimingBody';
import type { RootStackParamList } from '@/app/navigation';

// F6.P (USER_FLOWS.md) — after roughly this long pending, stop implying imminence and offer an
// exit rather than a bare spinner with no timeout (DE-8).
const TAKING_LONGER_MS = 2 * 60 * 1000;

/** How far down the Devices card's own top edge parks — passed through to `CurtainGround`. */
const DEVICES_CURTAIN_TOP_RATIO = 0.31;
/** How long the "Looking for your device…" beat shows before the "We need Bluetooth to pair"
 * dialog replaces it — reference screenshots asked for "a sec" of this before the dialog. */
const PAIRING_LOADING_MS = 2000;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/** Minimal person glyph — no icon set exists yet, this is small enough to hand-author inline
 * rather than pull in an icon library for one glyph. Relocated from `app/navigation.tsx`
 * (P0-7.0 follow-up): Home now owns its header, so this has no other consumer. */
function ProfileGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" fill={color} />
      <Path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Home's identity control — an avatar + account identifier pill, top-left of the header
 * (reference screenshot). `accountIdentifier` is the same email/phone display string
 * `ProfileScreen` shows under "Signed in as" — see that util's own header comment, which has
 * anticipated a second consumer here since P1-8.0. Same glass tint as the rest of the kit's
 * icon buttons, just pill-shaped to fit the label.
 */
function IdentityPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
    >
      <View style={styles.pillFill} />
      <View style={styles.pillAvatar}>
        <View style={styles.pillAvatarFill} />
        <View style={styles.pillAvatarHighlight} />
        <ProfileGlyph size={20} color={tokens.color.textSecondary} />
      </View>
      <Text variant="label" tone="primary" style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A header action rendered as text — still used for the dev-only "Screens" gallery link. */
function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.headerTextButton}
    >
      <Text variant="label" tone="link">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "+" opens this instead of navigating — a transparent `Modal` over Home (same dimmed-backdrop
 * idiom `Sheet.tsx` uses, at a much lighter opacity: "slight overlay" over Home's own gradient
 * showing through, not a heavy scrim). Two phases, not one: a brief "Looking for your
 * device…" beat (the same copy/spinner `DeviceScanScreen` uses for its real scan — here purely
 * a materializing effect, since there's no permission yet to actually scan with) for
 * `PAIRING_LOADING_MS`, then the "We need Bluetooth to pair" content replaces it as a small
 * centered dialog card (reference screenshot's native-alert-style composition), rather than the
 * full-width sheet `BluetoothPrimingScreen` itself uses.
 */
function PairingModal({
  visible,
  onContinue,
  onClose,
}: {
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'dialog'>('loading');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPhase('loading');
    const timer = setTimeout(() => setPhase('dialog'), PAIRING_LOADING_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pairingRoot}>
        <Pressable
          style={styles.pairingBackdrop}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <View style={styles.pairingCenter} pointerEvents="box-none">
          {phase === 'loading' ? (
            <View style={styles.pairingLoading}>
              <ActivityIndicator size="large" />
              <Text variant="title" style={styles.centerText}>
                Looking for your device…
              </Text>
              <Text variant="body" tone="secondary" style={styles.centerText}>
                Hold your BlueSmoke close and make sure it's switched on.
              </Text>
            </View>
          ) : (
            <View style={styles.pairingDialog}>
              <BluetoothPrimingBody onContinue={onContinue} onNotNow={onClose} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * DV-1/DV-2 (F7.1, `SCREEN_MAP.md`) — the old hardcoded "No devices paired" card collapses into
 * this one render because no paired-device store exists yet — pairing dead-ends at
 * `PairingBoundaryScreen` (OQ-12), so a paired device can never actually reach this screen in
 * the current build. When a device store lands (P1-5.0), that's the point to branch this into
 * an actual list.
 *
 * Built on `CurtainGround` (P0-7.0 follow-up) — the gradient + "BlueSmoke" wordmark + curtain
 * card shell shared with `BluetoothPrimingScreen`. Native header turned off in `navigation.tsx`
 * so the gradient runs edge-to-edge behind the status bar; the identity pill replaces the old
 * native `headerRight` avatar button.
 *
 * Tapping "+" no longer navigates — `PairingModal` opens in place, a dimmed dialog over Home
 * rather than a pushed screen. "Continue" inside it still moves on to the real permission-check
 * screen (`BluetoothGate`); "Not now"/the backdrop just closes the modal, since there was never
 * anywhere to navigate back from.
 *
 * Sign-out moved to the Profile screen in P1-8.0, which is where the TODO puts it and which is
 * reachable from this screen's identity pill. It is still the only way back out of the gated
 * stack.
 */
export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSessionStore((s) => s.user);
  const [pairingOpen, setPairingOpen] = useState(false);

  return (
    <View style={styles.root}>
      <CurtainGround
        curtainTopRatio={DEVICES_CURTAIN_TOP_RATIO}
        titleTopSpacing={tokens.spacing.lg}
        subtitle={getGreeting()}
        headerLeft={
          __DEV__ ? (
            <HeaderTextButton label="Screens" onPress={() => navigation.navigate('ScreenGallery')} />
          ) : undefined
        }
        headerRight={
          <IdentityPill
            label={accountIdentifier(user?.email, user?.phone)}
            onPress={() => navigation.navigate('Profile')}
          />
        }
      >
        <Text variant="label" tone="secondary" style={styles.sectionLabel}>
          Devices
        </Text>
        <EmptyState
          title="No devices paired"
          body="Pair your BlueSmoke to lock and unlock it from your phone."
        />
        <View style={styles.pairSpacer} />
        <View style={styles.pairSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pair a device"
            onPress={() => setPairingOpen(true)}
            style={({ pressed }) => [styles.glassButton, pressed && styles.glassButtonPressed]}
          >
            <View style={styles.glassHighlight} />
            <Text variant="title" tone="link" style={styles.glassPlus}>
              +
            </Text>
          </Pressable>
          <Text variant="body" style={styles.centerText}>
            Pair a device
          </Text>
        </View>
      </CurtainGround>
      <PairingModal
        visible={pairingOpen}
        onContinue={() => {
          setPairingOpen(false);
          navigation.navigate('BluetoothGate');
        }}
        onClose={() => setPairingOpen(false)}
      />
    </View>
  );
}

/**
 * VF-3 / VF-4 (F6.5, F6.P — `SCREEN_MAP.md`'s navigation-structure table assigns VF-3 to this
 * exact `pending` stack). Shown while the age-gate query is in flight, and while an inquiry is
 * awaiting the vendor's decision. Kept in this file so the gated stack has no partial-state
 * gaps.
 *
 * F6.Z — this was a second instance of the same stranding trap `PersonaVerificationScreen` had:
 * zero controls, on a stack `sessionStatus === 'signedIn'` keeps mounted indefinitely. Now
 * carries a persistent sign-out. After `TAKING_LONGER_MS`, the copy stops implying the check is
 * seconds away (VF-4) — "We'll notify you" is reassurance copy, not a button: there is no push
 * wiring to opt into (SY-2/3 are blocked on a backend that doesn't exist), and a button with no
 * destination is exactly the dead-CTA bug this project's tests exist to catch.
 */
export function VerificationPendingScreen() {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLonger(true), TAKING_LONGER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      {takingLonger ? (
        <>
          <Text variant="title" style={styles.centerText}>
            This is taking longer than usual
          </Text>
          <Text variant="body" tone="secondary" style={styles.centerText}>
            Nothing's wrong, and you don't need to do anything. We'll let you know as soon as
            it's done.
          </Text>
        </>
      ) : (
        <>
          <Text variant="title" style={styles.centerText}>
            Confirming your verification…
          </Text>
          <Text variant="body" tone="secondary" style={styles.centerText}>
            We're waiting on the result. This can take a moment — you don't need to do anything
            else right now.
          </Text>
        </>
      )}
      <View style={styles.signOut}>
        <SignOutButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pairingRoot: {
    flex: 1,
  },
  // "Slight overlay", not the heavier 0.5 `Sheet.tsx` uses for destructive confirms — Home's own
  // gradient (already showing through, `Modal transparent`) should still read clearly behind it.
  pairingBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.textPrimary,
    opacity: 0.18,
  },
  pairingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
  },
  pairingLoading: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  // Rounded on all sides and compact, not the full-width bottom sheet `BluetoothPrimingScreen`
  // itself uses — a small centered dialog, matching the reference screenshot's native-alert
  // composition.
  pairingDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: tokens.color.surfaceTint,
    borderRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
    ...tokens.elevation.card,
  },
  headerTextButton: {
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: tokens.touchTarget.minHeight,
    paddingRight: tokens.spacing.md,
    borderRadius: tokens.radii.full,
    borderWidth: 1,
    borderColor: tokens.color.border,
    overflow: 'hidden',
    maxWidth: 140,
  },
  pillPressed: {
    opacity: 0.7,
  },
  // Same translucent-fill recipe as `pillAvatarFill` — a low-opacity tint layer under the
  // content, not a solid `brandTint` fill, so the gradient behind the whole pill reads through
  // it rather than the pill sitting on it as an opaque chip.
  pillFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.brandTint,
    opacity: 0.4,
  },
  // Sized to fill the pill's own height flush with its left edge — no padding around it — so
  // the circle sits inside the pill's rounded left cap exactly, the way a chip's avatar sits
  // flush in its rounded end, rather than floating inside a padded gap.
  pillAvatar: {
    width: tokens.touchTarget.minHeight,
    height: tokens.touchTarget.minHeight,
    marginRight: tokens.spacing.sm,
    borderRadius: tokens.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Translucent rather than the flat opaque `surface` fill it replaced — a partial-opacity
  // white layer under the highlight blob is this kit's whole "glass" recipe (no native blur
  // dependency), same idiom as `glassHighlight` elsewhere in this file.
  pillAvatarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.surface,
    opacity: 0.16,
  },
  pillAvatarHighlight: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 18,
    height: 10,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.surface,
    opacity: 0.35,
  },
  pillLabel: {
    flexShrink: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
    backgroundColor: tokens.color.background,
  },
  centerText: {
    textAlign: 'center',
  },
  signOut: {
    marginTop: tokens.spacing.xl,
    alignSelf: 'stretch',
  },
  sectionLabel: {
    marginBottom: tokens.spacing.sm,
  },
  pairSpacer: {
    flexGrow: 1,
  },
  pairSection: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  glassButton: {
    width: 72,
    height: 72,
    borderRadius: tokens.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.brandTint,
    overflow: 'hidden',
    ...tokens.elevation.card,
  },
  glassButtonPressed: {
    opacity: 0.7,
  },
  glassHighlight: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 32,
    height: 18,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.surface,
    opacity: 0.5,
  },
  glassPlus: {
    fontSize: 32,
    lineHeight: 34,
  },
});
