import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Text } from './Text';
import { tokens } from './tokens';

export interface CurtainGroundProps {
  /** The curtain's contents. */
  children: ReactNode;
  /** Top-left of the header row, above the gradient — e.g. Home's notification glyph. */
  headerLeft?: ReactNode;
  /** Centre of the header row, e.g. a small brand mark. Truly centred regardless of how wide
   * `headerLeft`/`headerRight` render, since all three slots share equal flex. */
  headerCenter?: ReactNode;
  /** Top-right of the header row — e.g. the profile icon. */
  headerRight?: ReactNode;
  /** Extra styles merged onto the curtain card itself. */
  style?: StyleProp<ViewStyle>;
  /** Overrides how far down the curtain's top edge parks, as a fraction of screen height.
   * Defaults to `DEFAULT_CURTAIN_TOP_RATIO` — pass a smaller fraction for a taller card. */
  curtainTopRatio?: number;
  /** Extra space above the "BlueSmoke" title, beyond the header row's own padding. Defaults to
   * 0 — nudge the wordmark down without moving the header row above it. */
  titleTopSpacing?: number;
  /** A line rendered below the "BlueSmoke" title — e.g. Home's time-of-day greeting. Omitted by
   * default; no other current consumer wants one. */
  subtitle?: string;
}

/**
 * How far down the curtain's top edge parks by default, as a fraction of screen height. Shared
 * by every screen that uses this component so they read as one continuous motion rather than
 * differently-sized sheets (P0-7.0 follow-up), unless a screen opts into a taller/shorter card
 * via `curtainTopRatio`.
 */
const DEFAULT_CURTAIN_TOP_RATIO = 0.36;

/**
 * The gradient hero + "BlueSmoke" wordmark + fixed-height curtain card motif shared by Home and
 * the device-pairing entry screen (execution brief P0-7.0 follow-up, reference screenshots).
 * Unlike `GradientGround`, the curtain has a fixed resting height (not `flex: 1`) so the
 * gradient — and the wordmark sitting on it — stays visible above the card, and it renders its
 * own full-bleed gradient + header row rather than assuming a native header, so a screen using
 * this owns `headerShown: false` in `navigation.tsx`.
 */
export function CurtainGround({
  children,
  headerLeft,
  headerCenter,
  headerRight,
  style,
  curtainTopRatio = DEFAULT_CURTAIN_TOP_RATIO,
  titleTopSpacing = 0,
  subtitle,
}: CurtainGroundProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const curtainTop = Math.round(height * curtainTopRatio);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[tokens.color.groundTopStrong, tokens.color.groundBottomTint]}
        style={styles.gradient}
      />

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + tokens.spacing.md, paddingHorizontal: insets.left + tokens.spacing.lg },
        ]}
      >
        <View style={styles.headerSide}>{headerLeft}</View>
        <View style={[styles.headerSide, styles.headerCenterSide]}>{headerCenter}</View>
        <View style={[styles.headerSide, styles.headerRightSide]}>{headerRight}</View>
      </View>

      <Text variant="title" style={[styles.brandTitle, { marginTop: titleTopSpacing }]}>
        BlueSmoke
      </Text>
      {subtitle && (
        <Text variant="body" tone="secondary" style={styles.subtitle}>
          {subtitle}
        </Text>
      )}

      <View
        style={[
          styles.curtain,
          { top: curtainTop, paddingBottom: insets.bottom + tokens.spacing.md },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: tokens.spacing.md,
  },
  // Equal flex on all three slots — `headerCenter` lands on the row's true centre regardless of
  // how wide `headerLeft`/`headerRight` render, rather than the visual centre drifting toward
  // whichever side is narrower the way an unflexed `space-between` row would.
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenterSide: {
    justifyContent: 'center',
  },
  headerRightSide: {
    justifyContent: 'flex-end',
  },
  brandTitle: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: tokens.spacing.xs,
  },
  curtain: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.surfaceTint,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
    ...tokens.elevation.sheetEdge,
  },
});
