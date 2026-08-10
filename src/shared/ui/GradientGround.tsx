import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { tokens } from './tokens';

export interface GradientGroundProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const HEADER_WASH_HEIGHT = 160;

/**
 * The soft blue gradient ground + overlapping white sheet motif (execution brief §3) — every
 * screen wanting it composes this rather than hand-rolling the gradient and the corner radius.
 *
 * `groundTop`/`groundBottom` appear only inside the `colors` array below, which is why neither
 * needs a `contrastPairs` entry: `contrastCompleteness.test.ts` only classifies `key: value` /
 * `key={value}` style references, and an array element matches neither shape. That is also
 * accurate to how they're used — nothing renders text directly against the gradient; content
 * lives on the sheet it overlaps, per the visual language.
 */
export function GradientGround({ children, style }: GradientGroundProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[tokens.color.groundTop, tokens.color.groundBottom]}
        style={styles.gradient}
      />
      <View style={[styles.sheet, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_WASH_HEIGHT,
  },
  sheet: {
    flex: 1,
    marginTop: HEADER_WASH_HEIGHT - tokens.spacing.xxl,
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
  },
});
