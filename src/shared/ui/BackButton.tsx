import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface BackButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Announced to assistive tech; visible label stays a glyph. */
  accessibilityLabel?: string;
}

/**
 * Floating rounded-square back affordance for a coloured ground (`ScreenScaffold`'s `back`
 * slot) — a nav-bar chevron doesn't exist once a screen has no nav bar. Meets the same minimum
 * hit area as every other pressable primitive in this kit.
 */
export function BackButton({ accessibilityLabel = 'Back', disabled, ...rest }: BackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      style={({ pressed }) => [styles.base, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
      {...rest}
    >
      <Text variant="body" tone="inverse" style={styles.glyph}>
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
