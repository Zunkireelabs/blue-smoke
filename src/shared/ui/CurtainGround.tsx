import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Text, type Tone } from './Text';
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
  /** Extra space above the title (or `eyebrow`, when given — see below), beyond the header
   * row's own padding. Defaults to 0 — nudge the hero block down without moving the header row
   * above it. */
  titleTopSpacing?: number;
  /** The big headline text. Defaults to `'BlueSmoke'`, the only value any consumer has needed
   * until Home's personalised hero — pass a different string to replace the wordmark entirely
   * rather than sit alongside it. */
  title?: string;
  /** A small uppercase label rendered above the title — e.g. Home's time-of-day greeting.
   * Omitted by default; no other current consumer wants one. */
  eyebrow?: string;
  /** A bold line rendered directly below `eyebrow`, at the same size/weight as `title` — e.g.
   * Home's display name, kept on its own line rather than joined into `eyebrow`'s small caps.
   * Has no effect without `eyebrow`; omitted by default. */
  name?: string;
  /** A line rendered below the title (and below `divider`, when both are given). Omitted by
   * default; no other current consumer wants one. */
  subtitle?: string;
  /** Left-aligns `eyebrow`/`name`/`title`/`subtitle` (and indents them to match the header row's
   * own horizontal padding) instead of the default centred layout. Defaults to `'center'` —
   * every existing consumer keeps its current centred wordmark unless it opts in. */
  align?: 'center' | 'left';
  /** Renders a short decorative rule between `title` and `subtitle`. Defaults to `false`. Has no
   * effect without `subtitle` — there is nothing below it to separate from `title`. */
  divider?: boolean;
  /** Overrides the gradient's colour stops — defaults to the shared `groundTopStrong` →
   * `groundBottomTint` wash every other `CurtainGround` screen uses. Pass alongside
   * `washLocations` for anything beyond an evenly-spaced 2-stop gradient. */
  washColors?: readonly string[];
  /** Fractional stop positions (0–1) matching `washColors`, for `react-native-linear-gradient`'s
   * `locations` prop. Omitted for the default 2-stop wash, which is evenly spaced. */
  washLocations?: readonly number[];
  /** Tone for `title`. Defaults to `'primary'` (near-black), correct for the pale default wash.
   * A screen opting into a darker/richer `washColors` (e.g. Home's brand wash) should pass
   * `'inverse'` so the title stays legible against it. */
  titleTone?: Tone;
  /** Tone for `eyebrow` and `subtitle` — same reasoning as `titleTone`, defaults to
   * `'secondary'`. */
  subtitleTone?: Tone;
}

const DEFAULT_WASH_COLORS: readonly string[] = [tokens.color.groundTopStrong, tokens.color.groundBottomTint];

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
  title = 'BlueSmoke',
  eyebrow,
  name,
  subtitle,
  align = 'center',
  divider = false,
  washColors,
  washLocations,
  titleTone = 'primary',
  subtitleTone = 'secondary',
}: CurtainGroundProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const curtainTop = Math.round(height * curtainTopRatio);
  const isLeftAligned = align === 'left';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...(washColors ?? DEFAULT_WASH_COLORS)]}
        locations={washLocations ? [...washLocations] : undefined}
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

      <View
        style={[
          isLeftAligned && { paddingHorizontal: insets.left + tokens.spacing.lg },
          { marginTop: titleTopSpacing },
        ]}
      >
        {eyebrow && (
          <Text
            variant="label"
            tone={subtitleTone}
            style={[styles.eyebrow, isLeftAligned && styles.leftAlign]}
          >
            {eyebrow}
          </Text>
        )}
        {eyebrow && name && (
          <Text
            variant="title"
            tone={titleTone}
            style={[styles.brandTitle, styles.compactHeroText, isLeftAligned && styles.leftAlign]}
          >
            {name}
          </Text>
        )}
        <Text
          variant="title"
          tone={titleTone}
          style={[
            styles.brandTitle,
            name && styles.compactHeroText,
            isLeftAligned && styles.leftAlign,
            eyebrow && (name ? styles.titleAfterName : styles.titleAfterEyebrow),
          ]}
        >
          {title}
        </Text>
        {divider && subtitle && (
          <View style={[styles.divider, isLeftAligned ? styles.dividerLeft : styles.dividerCenter]} />
        )}
        {subtitle && (
          <Text variant="body" tone={subtitleTone} style={[styles.subtitle, isLeftAligned && styles.leftAlign]}>
            {subtitle}
          </Text>
        )}
      </View>

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
  // Applied to both `name` and `title` only when `name` is given — that's a 5-line composition
  // (eyebrow, name, title, divider, subtitle) competing for Home's tight hero budget, verified
  // against a real device: at the full `title` size (28) the subtitle rendered flush against the
  // curtain's top edge with no margin at all — safe today, but one Dynamic Type step or a longer
  // display name would push it under the curtain, invisible rather than clipped-and-obvious. A
  // local numeric override rather than touching the shared `title` typography token, which
  // BluetoothPrimingScreen's plain centred "BlueSmoke" (no `name`) must keep unchanged.
  compactHeroText: {
    fontSize: 24,
    lineHeight: 29,
  },
  // Small uppercase label above the title (Home's greeting + name) — `label` (14) rather than
  // `caption` (12), and still a single line at that size on real content. Reused from the
  // existing type scale rather than a new token: Home's curtain parks as high as 31% down the
  // screen (`DEVICES_CURTAIN_TOP_RATIO`), so every extra line above the title eats directly into
  // an already-tight budget between the header row and the curtain's top edge.
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.82,
  },
  // Only applied when `eyebrow` is present (without `name`) — with no eyebrow, `titleTopSpacing`
  // on the parent container already places the title correctly, and this would add a redundant
  // gap.
  titleAfterEyebrow: {
    marginTop: tokens.spacing.xs,
  },
  // Applied instead of `titleAfterEyebrow` when `name` renders between `eyebrow` and `title` —
  // a visibly larger gap than the tight `eyebrow`→`name` spacing (`brandTitle` carries no margin
  // of its own), so the eyebrow+name block reads as one unit, separate from the title below it.
  // Kept to `sm` rather than `lg`/`md` — with `name` in play there are already five lines
  // competing for Home's tight hero budget (`DEVICES_CURTAIN_TOP_RATIO` parks the curtain as
  // high as 31% down the screen); every point spent on a gap is a point not available to text.
  titleAfterName: {
    marginTop: tokens.spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    marginTop: tokens.spacing.xs,
  },
  leftAlign: {
    textAlign: 'left',
  },
  // Plain `textInverse` at low opacity — the same "solid token + opacity style" trick
  // `HomeScreen.tsx`'s `iconChipBg`/`pairingBackdrop` already use, so no new translucent token
  // is needed in `tokens.ts` for one decorative rule.
  divider: {
    width: 36,
    height: 3,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.textInverse,
    opacity: 0.4,
    marginTop: tokens.spacing.sm,
  },
  dividerCenter: {
    alignSelf: 'center',
  },
  dividerLeft: {
    alignSelf: 'flex-start',
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
