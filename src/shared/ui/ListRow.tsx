import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface ListRowProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  /** Leading icon/glyph slot — a `Text` glyph or any small element; layout only, no default. */
  icon?: ReactNode;
  /** Trailing value, e.g. a battery percentage or a chevron rendered by the caller. */
  trailing?: ReactNode;
}

/**
 * The light-grey rounded row used for `DV-4`/`DV-9`/`PF-*`/`CountryPicker` list items —
 * execution brief §3, "List rows as light-grey rounded containers with a leading icon."
 *
 * Not a `FlatList` item renderer itself — callers own the list, this owns one row's chrome.
 */
export function ListRow({ label, icon, trailing, disabled, ...rest }: ListRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      style={({ pressed }) => [styles.base, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
      {...rest}
    >
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      {trailing && <View style={styles.trailing}>{trailing}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.backgroundMuted,
    borderRadius: tokens.radii.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: tokens.spacing.md,
  },
  label: {
    flex: 1,
  },
  trailing: {
    marginLeft: tokens.spacing.md,
  },
});
