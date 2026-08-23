import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface CodeSegmentsProps {
  /** How many digits the code has. Six everywhere in this app; the reference design's four is
   *  the vendor's, not ours. */
  length: number;
  /** The digits entered so far. Shorter than `length` while the user is still typing. */
  code: string;
  /** Whether the hidden input behind these boxes currently has focus — drives the highlight. */
  focused: boolean;
  /** Focus the hidden input. The boxes are a display layer; this is what makes them feel real. */
  onPress: () => void;
  accessibilityLabel?: string;
}

/**
 * The segmented code display shared by both OTP screens (`OtpEntryScreen`, phone, and
 * `EmailCodeEntryScreen`, email).
 *
 * Extracted 2026-08-12 during the reference restyle. The two screens deliberately duplicated
 * each other before that (see `EmailCodeEntryScreen`'s header — reusing the behaviour was
 * preferred over refactoring a shipped screen), and their *logic* still does: verify call,
 * cooldown length and resend path all differ. What is extracted here is only the part that is
 * genuinely identical and easy to get subtly wrong in two places — the flex-width boxes and the
 * rule for which one is highlighted.
 */
export function CodeSegments({
  length,
  code,
  focused,
  onPress,
  accessibilityLabel = 'Enter verification code',
}: CodeSegmentsProps) {
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            // The box the next digit will land in is `code.length`. Once the code is complete
            // there is no next box, so the highlight stays on the last one rather than running
            // off the end of the row.
            focused && i === Math.min(code.length, length - 1) && styles.segmentActive,
          ]}
        >
          <Text variant="title" style={styles.digit}>
            {code[i] ?? ''}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  segment: {
    // `flex`, not a fixed width: six boxes at the reference design's width overflow a phone
    // screen, so they share the row instead. Height stays fixed to keep them square-ish.
    flex: 1,
    height: 56,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    borderWidth: 1.5,
    borderColor: tokens.color.brand,
  },
  digit: {
    textAlign: 'center',
  },
});
