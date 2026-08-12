import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from './tokens';

export interface ScreenScaffoldProps {
  back?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
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
          // Longhand `paddingTop`/etc. here would *replace*, not add to, `styles.container`'s
          // `padding: xl` shorthand for that edge once the array is flattened — on a device with
          // no side inset (insets.left/right = 0 in portrait) that silently zeroes the intended
          // content padding rather than sitting outside it. Summed explicitly so `xl` always
          // holds regardless of which edges the safe area actually contributes to.
          paddingTop: insets.top + tokens.spacing.xl,
          paddingBottom: insets.bottom + tokens.spacing.xl,
          paddingLeft: insets.left + tokens.spacing.xl,
          paddingRight: insets.right + tokens.spacing.xl,
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
