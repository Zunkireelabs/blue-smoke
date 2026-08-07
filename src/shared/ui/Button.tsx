import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  loading?: boolean;
}

/**
 * The kit's only button variant (primary/filled) — screens have not needed a second one yet.
 * Disabled state is expressed as opacity over the whole control, not a distinct color token
 * pair, so there is nothing here for the contrast test to check beyond the enabled pair (WCAG
 * does not require disabled controls to meet AA).
 *
 * Hit area is fixed at `tokens.touchTarget` regardless of label length —
 * `__tests__/touchTarget.test.ts` resolves this style and asserts it.
 */
export function Button({ label, loading = false, disabled, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      style={({ pressed }) => [styles.base, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={tokens.color.interactivePrimaryText} />
      ) : (
        <Text variant="label" tone="inverse">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.touchTarget.minHeight,
    minWidth: tokens.touchTarget.minWidth,
    backgroundColor: tokens.color.interactivePrimaryBackground,
    borderRadius: tokens.radii.md,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
});
