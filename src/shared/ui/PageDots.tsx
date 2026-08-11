import { StyleSheet, View } from 'react-native';
import { tokens } from './tokens';

export interface PageDotsProps {
  count: number;
  activeIndex: number;
}

/**
 * Dot page indicator — replaces the literal `"1 of 3"` string on the onboarding carousel
 * (part 3). The row itself is decorative and hidden from screen readers; the container carries
 * the same "N of M" text an accessibility service would otherwise announce, so the information
 * the string used to convey is not lost, only moved off the visible dots.
 */
export function PageDots({ count, activeIndex }: PageDotsProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Page ${activeIndex + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dot, index === activeIndex ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  dot: {
    width: tokens.spacing.sm,
    height: tokens.spacing.sm,
    borderRadius: tokens.radii.full,
  },
  dotActive: {
    backgroundColor: tokens.color.surface,
  },
  // Dimmed by a distinct, already-classified token rather than opacity — decorative, but the
  // same no-alpha discipline the brand-ground text rule uses keeps this guard-clean too.
  dotInactive: {
    backgroundColor: tokens.color.backgroundMuted,
  },
});
