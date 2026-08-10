import { StyleSheet, Switch, type SwitchProps } from 'react-native';
import { tokens } from './tokens';

export interface ToggleProps extends Omit<SwitchProps, 'trackColor' | 'thumbColor'> {
  accessibilityLabel: string;
}

/**
 * Wraps RN `Switch` for `PF-4` notification preferences. Colors go through `StyleSheet.create`
 * (recognized `backgroundColor:` usages, same as every other primitive) and are read back out
 * with `StyleSheet.flatten` rather than passed as `tokens.color.*` directly on `trackColor`'s
 * `false`/`true` keys — `Switch`'s API, not a style prop, so a direct reference there would be
 * an untracked color reference the contrast-completeness guard couldn't see.
 */
export function Toggle({ accessibilityLabel, ...rest }: ToggleProps) {
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      trackColor={{
        false: StyleSheet.flatten(trackFill.off).backgroundColor,
        true: StyleSheet.flatten(trackFill.on).backgroundColor,
      }}
      thumbColor={StyleSheet.flatten(thumbFill.base).backgroundColor}
      {...rest}
    />
  );
}

const trackFill = StyleSheet.create({
  off: { backgroundColor: tokens.color.backgroundMuted },
  on: { backgroundColor: tokens.color.brand },
});

const thumbFill = StyleSheet.create({
  base: { backgroundColor: tokens.color.surface },
});
