import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

type Tone = 'success' | 'danger' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: Tone;
}

/**
 * Status chip for `PF-1` verification status and `LK-*` lock state.
 *
 * ── Colour never carries the meaning ──────────────────────────────────────────────────
 *
 * The tone drives a coloured dot; the *label* is what states the status, in primary text on a
 * tinted ground. That ordering is deliberate and worth preserving: a user who cannot separate
 * the green from the red still reads "Verified" or "Locked". The dot is marked
 * `accessibilityElementsHidden` so a screen reader announces the label once, not a bullet
 * followed by the label.
 *
 * (An earlier revision sized the glyph large to clear the 3:1 non-text threshold, because the
 * original `success` green missed 4.5:1. The token has since been darkened to pass at body
 * size — see `successRaw` in `tokens.ts` — so the size here is now a plain design choice.)
 */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.base, containerStyles[tone]]}>
      <Text
        style={[styles.glyph, glyphStyles[tone]]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        ●
      </Text>
      <Text variant="label">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: tokens.radii.full,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    gap: tokens.spacing.xs,
  },
  glyph: {
    fontSize: 18,
    lineHeight: 18,
  },
});

const containerStyles = StyleSheet.create({
  success: { backgroundColor: tokens.color.successBg },
  danger: { backgroundColor: tokens.color.dangerBackground },
  neutral: { backgroundColor: tokens.color.backgroundMuted },
});

const glyphStyles = StyleSheet.create({
  success: { color: tokens.color.success },
  danger: { color: tokens.color.dangerText },
  neutral: { color: tokens.color.textSecondary },
});
