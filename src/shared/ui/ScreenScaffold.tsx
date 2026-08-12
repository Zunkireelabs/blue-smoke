import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from './tokens';

export interface ScreenScaffoldProps {
  back?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
}

// Longhand `paddingTop`/etc. on the container would *replace*, not add to, a `padding: xl`
// shorthand for that edge once a style array flattens — on a device with no side inset
// (insets.left/right = 0 in portrait) that silently zeroes the intended content padding rather
// than sitting outside it. Summed explicitly via this single function so `xl` always holds
// regardless of which edges the safe area actually contributes to, and so this scaffold's own
// padding and `useScaffoldContentWidth` below can never drift apart from each other.
function edgePadding(inset: number): number {
  return inset + tokens.spacing.xl;
}

/**
 * The width available to a horizontally-measured child of `ScreenScaffold`'s `body` slot (e.g.
 * a paging `ScrollView`'s pages) — `useWindowDimensions().width` minus this scaffold's own
 * left/right padding. Exported so no consumer has to re-derive `insets.left/right -
 * tokens.spacing.xl` itself (execution brief, UI-BUILD-E part 3 follow-up): that formula written
 * a second time, in a screen, is what let it drift from `ScreenScaffold`'s own padding on the
 * first attempt at this.
 */
export function useScaffoldContentWidth(): number {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return width - edgePadding(insets.left) - edgePadding(insets.right);
}

/**
 * The layout every later part's screens are built on (execution brief UI-BUILD-E part 1):
 * `back` top-left, `header` (mark/wordmark) in the upper third, a flexible middle, `actions`
 * pinned to the bottom safe area, `footnote` below them.
 *
 * 🔴 The middle is empty space on purpose — the space is the design. `body` renders inside it
 * without changing that: the wrapper stays `flex: 1` whether or not `body` is given, so an
 * absent `body` doesn't collapse the gap between `header` and `actions`.
 */
export function ScreenScaffold({ back, header, body, actions, footnote }: ScreenScaffoldProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: edgePadding(insets.top),
          paddingBottom: edgePadding(insets.bottom),
          paddingLeft: edgePadding(insets.left),
          paddingRight: edgePadding(insets.right),
        },
      ]}
    >
      {back ? <View style={styles.back}>{back}</View> : null}
      {header ? <View style={styles.header}>{header}</View> : null}
      <View style={styles.middle}>{body}</View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
      {footnote ? <View style={styles.footnote}>{footnote}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  back: {
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xl,
  },
  middle: {
    flex: 1,
  },
  actions: {
    gap: tokens.spacing.sm,
  },
  footnote: {
    paddingTop: tokens.spacing.sm,
    alignItems: 'center',
  },
});
