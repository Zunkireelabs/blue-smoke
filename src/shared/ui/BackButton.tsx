import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface BackButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Announced to assistive tech; visible label stays a glyph. */
  accessibilityLabel?: string;
  /**
   * `'onBrand'` (default, unchanged) — filled `brandDark` square, for a coloured ground.
   * `'plain'` — no fill, dark glyph, for use inside `AuthScaffold`'s light sheet, where a filled
   * blue square would read as a button competing with the screen's actual primary action.
   */
  tone?: 'onBrand' | 'plain';
}

/**
 * Floating rounded-square back affordance for a coloured ground (`ScreenScaffold`'s `back`
 * slot) — a nav-bar chevron doesn't exist once a screen has no nav bar. Meets the same minimum
 * hit area as every other pressable primitive in this kit.
 */
export function BackButton({
  accessibilityLabel = 'Back',
  disabled,
  tone = 'onBrand',
  ...rest
}: BackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        tone === 'plain' && styles.plain,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      {...rest}
    >
      <Text variant="body" tone={tone === 'plain' ? 'primary' : 'inverse'} style={styles.glyph}>
        {'‹'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.touchTarget.minHeight,
    minWidth: tokens.touchTarget.minWidth,
    borderRadius: tokens.radii.lg,
    backgroundColor: tokens.color.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {
    backgroundColor: tokens.color.backgroundMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  glyph: {
    fontSize: 24,
    lineHeight: 24,
  },
});
