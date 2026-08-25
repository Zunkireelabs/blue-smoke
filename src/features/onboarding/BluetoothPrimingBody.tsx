import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, Text, tokens } from '@/shared/ui';

export interface BluetoothPrimingBodyProps {
  /** Triggers the real permission flow — Phase D wires this to the actual request. */
  onContinue: () => void;
  onNotNow: () => void;
}

/** Standard Bluetooth rune, hand-authored inline — same convention `HomeScreen.tsx`'s
 * `ProfileGlyph`/`BellGlyph`/`DeviceLockGlyph` already use (no icon set exists yet, one glyph
 * doesn't justify pulling one in). Colour comes from `tokens.color.link` at the call site below,
 * not hardcoded here — reuses the already-registered "link on brandTint" `contrastPairs` entry
 * rather than introducing a new `brand`-as-foreground combo the completeness guard doesn't know
 * about. */
function BluetoothGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 7 17 17 12 22V2l5 5L7 15"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * ON-4 (F7.2, `SCREEN_MAP.md`) — the headline/body/actions content of Bluetooth priming, split
 * out of `BluetoothPrimingScreen` so it can render two ways: as that screen's own `CurtainGround`
 * curtain, and as the floating card `HomeScreen` stacks over its "Devices" card when "+" is
 * tapped (no navigation — see `HomeScreen`'s own header comment). Keeping one copy of this copy
 * is the point; the two hosts differ, the words and buttons must not drift apart.
 *
 * CTA is "Continue", not "Turn on Bluetooth" (the copy this screen originally shipped with in
 * `screenSpecs.ts`'s placeholder). "Turn on Bluetooth" describes the PRIOR screen's problem
 * (power state, ON-9) — this one is about the PERMISSION dialog, and iOS cannot flip a power
 * state from an app button regardless. Reusing that label here would tell the user the button
 * does something it cannot on either axis.
 */
export function BluetoothPrimingBody({ onContinue, onNotNow }: BluetoothPrimingBodyProps) {
  return (
    <>
      <View style={styles.iconChip}>
        <BluetoothGlyph size={28} color={tokens.color.link} />
      </View>
      <Text variant="title" style={styles.title}>
        We need Bluetooth to pair
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        BlueSmoke talks to your device over Bluetooth to lock and unlock it as you come and go.
        It only ever connects to devices you own.
      </Text>

      <View style={styles.actions}>
        <Button label="Continue" onPress={onContinue} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          onPress={onNotNow}
          style={({ pressed }) => [styles.notNow, pressed && styles.notNowPressed]}
        >
          <Text variant="label" tone="link">
            Not now
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  iconChip: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: tokens.radii.lg,
    backgroundColor: tokens.color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: tokens.spacing.lg,
  },
  body: {
    textAlign: 'center',
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  // Deliberately not `Button`'s `textLink` variant — that one's label tone is hardcoded to
  // `inverse` for use on `BrandGround`'s dark fill (see `Button.tsx`), which would render
  // invisible white text on this card's light `surfaceTint`. A local `Pressable` here keeps
  // `Button.tsx`'s API untouched (shared file, additive-only per `CLAUDE.md`) while still
  // meeting the same minimum touch target.
  notNow: {
    minHeight: tokens.touchTarget.minHeight,
    minWidth: tokens.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notNowPressed: {
    opacity: 0.7,
  },
});
