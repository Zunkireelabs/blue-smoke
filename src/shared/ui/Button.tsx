import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Text, type TextProps } from './Text';
import { tokens } from './tokens';

type Variant = 'primary' | 'secondary' | 'destructive' | 'onBrand' | 'textLink';
type Shape = 'default' | 'pill';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  loading?: boolean;
  variant?: Variant;
  /**
   * `'pill'` — full-width, for use on `BrandGround` (`onBrand`/`textLink` variants). `'default'`
   * (unchanged) leaves width to the caller's layout, as every existing call site already relies
   * on.
   */
  shape?: Shape;
}

const TONE_BY_VARIANT: Record<Variant, TextProps['tone']> = {
  primary: 'inverse',
  secondary: 'link',
  destructive: 'danger',
  // Brand-coloured label on a white pill — `link`'s token value is the same approved brand blue.
  onBrand: 'link',
  textLink: 'inverse',
};

// `ActivityIndicator`'s `color` is a component prop, not a style key, so its value is read
// back out of a `StyleSheet.create` object (recognized `color:` usage) rather than assigned
// directly from `tokens.color.*` in a plain `Record` — same reasoning as `Toggle`'s
// `trackColor`, so `contrastCompleteness`'s scanner can still see and classify each reference.
const spinnerColor = StyleSheet.create({
  primary: { color: tokens.color.interactivePrimaryText },
  secondary: { color: tokens.color.link },
  destructive: { color: tokens.color.dangerText },
  onBrand: { color: tokens.color.link },
  textLink: { color: tokens.color.textInverse },
});

/**
 * Three variants, one control: `primary` (filled, brand) for the one action a screen wants
 * taken; `secondary` (tinted + brand outline) for a lesser action next to a primary, e.g.
 * `DV-11`'s "Not now"; `destructive` (outlined, danger) for irreversible actions, e.g. `PF-7`.
 * Reuses `danger*` — no second red, per the approved palette.
 *
 * Disabled state is expressed as opacity over the whole control, not a distinct color token
 * pair, so there is nothing here for the contrast test to check beyond the enabled pair (WCAG
 * does not require disabled controls to meet AA).
 *
 * Hit area is fixed at `tokens.touchTarget` regardless of label length or variant —
 * `__tests__/touchTarget.test.ts` resolves this style and asserts it.
 */
export function Button({
  label,
  loading = false,
  variant = 'primary',
  shape = 'default',
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        shape === 'pill' && styles.pill,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && pressedStyles[variant],
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={StyleSheet.flatten(spinnerColor[variant]).color} />
      ) : (
        <Text variant="label" tone={TONE_BY_VARIANT[variant]}>
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
    borderRadius: tokens.radii.full,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  pill: {
    width: '100%',
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: tokens.color.interactivePrimaryBackground,
  },
  secondary: {
    backgroundColor: tokens.color.brandTint,
    borderWidth: 1.5,
    borderColor: tokens.color.brand,
  },
  destructive: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1.5,
    borderColor: tokens.color.dangerBorder,
  },
  onBrand: {
    backgroundColor: tokens.color.surface,
  },
  // No fill, no border — a text-only secondary action on `BrandGround`.
  textLink: {
    backgroundColor: 'transparent',
  },
});

// Pressed state darkens the fill (primary) or deepens the tint (secondary/destructive) rather
// than dimming the whole control — `brandDark` is the approved palette's named pressed-state
// value for exactly this.
const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: tokens.color.brandDark,
  },
  secondary: {
    backgroundColor: tokens.color.brandTint,
    opacity: 0.7,
  },
  destructive: {
    backgroundColor: tokens.color.dangerBackground,
  },
  onBrand: {
    backgroundColor: tokens.color.brandTint,
  },
  textLink: {
    opacity: 0.7,
  },
});
