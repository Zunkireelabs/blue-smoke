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
 * The leading glyph is rendered at a large size deliberately, not decoratively: the `success`
 * token's green tops out around 4.1:1 contrast against any light surface in this palette —
 * short of the 4.5 AA body-text threshold no matter which side of the pair it's on, a property
 * of that exact hue — but it clears the 3:1 large-text threshold comfortably (see the
 * `contrastPairs` entry in `tokens.ts`). Rendering it small would make this an accessibility
 * defect, not just a guard-test failure, so the large size is load-bearing, not cosmetic.
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
