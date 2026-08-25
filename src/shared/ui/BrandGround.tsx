import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from './tokens';

export interface BrandGroundProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Full-bleed `tokens.color.brand` ground with safe-area padding (execution brief UI-BUILD-E
 * part 1, "Ground: option A"). Additive only — `GradientGround` stays the ground for every
 * screen that already uses it; nothing consumes this component yet.
 */
export function BrandGround({ children, style }: BrandGroundProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.brand,
  },
});
