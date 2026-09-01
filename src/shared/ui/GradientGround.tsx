import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { tokens } from './tokens';
import { GroundStatusBar } from './GroundStatusBar';

export interface GradientGroundProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Content rendered on the gradient wash itself, above the sheet — e.g. Home's title/identity
   * block. Absolutely positioned over the gradient rather than a normal flow sibling, so it
   * never affects the sheet's `marginTop` math below. Optional and additive: no existing
   * consumer passes this, so all 16 unchanged.
   */
  header?: ReactNode;
  /** Wash height in points. Defaults to the original 160 — every existing consumer keeps its
   * current look. Home passes a taller value to fit its title/identity `header` above. */
  washHeight?: number;
  /**
   * Throws a shadow up into the gradient from the sheet's curved top edge. Off by default (the
   * other 15 consumers are unchanged) — the curve there has no colour contrast to read by once
   * the gradient's faded this close to white, and this makes it visible without depending on
   * contrast. See `tokens.elevation.sheetEdge`.
   */
  elevatedSheet?: boolean;
  /**
   * Gradient stops. Defaults to the original `[groundTop, groundBottom]` pair — every existing
   * consumer keeps its current look. Home passes a more saturated pair so the band reads clearly
   * behind its title.
   */
  colors?: [string, string];
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
export function GradientGround({
  children,
  style,
  header,
  washHeight = HEADER_WASH_HEIGHT,
  elevatedSheet = false,
  colors = [tokens.color.groundTop, tokens.color.groundBottom],
}: GradientGroundProps) {
  return (
    <View style={styles.container}>
      {/* The bar sits over `colors[0]`, the wash's TOP stop — not the sheet below it. */}
      <GroundStatusBar topColor={colors[0]} />
      <LinearGradient
        colors={colors}
        style={[styles.gradient, { height: washHeight }]}
      />
      {header && <View style={styles.header}>{header}</View>}
      <View
        style={[
          styles.sheet,
          { marginTop: washHeight - tokens.spacing.xxl },
          elevatedSheet && tokens.elevation.sheetEdge,
          style,
        ]}
      >
        {children}
      </View>
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
  },
  header: {
    paddingTop: tokens.spacing.xxl,
    paddingHorizontal: tokens.spacing.xl,
  },
  sheet: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
  },
});
