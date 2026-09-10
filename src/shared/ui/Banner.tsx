import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { tokens } from './tokens';
import { clearBanner, useBannerStore } from './useBannerStore';

const AUTO_DISMISS_MS = 4000;

/**
 * App-wide in-app counterpart to the two OS notifications on this branch — mounted once at the
 * composition root (`App.tsx`), above `RootNavigator`, so it renders regardless of which
 * screen/stack is active. Reads `useBannerStore` directly (Zustand convention — no provider
 * needed), driven by `batteryNotifications.ts`/`connectionNotification.ts` alongside their
 * existing `notifee.displayNotification` calls.
 */
export function Banner() {
  const message = useBannerStore((state) => state.message);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => clearBanner(message.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) {
    return null;
  }

  const handlePress = (): void => {
    clearBanner(message.id);
    message.onPress?.();
  };

  return (
    <View pointerEvents="box-none" style={[styles.container, { top: insets.top + tokens.spacing.sm }]}>
      <Pressable onPress={handlePress} style={styles.banner} accessibilityRole="button">
        <Text variant="label">{message.text}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  banner: {
    maxWidth: '90%',
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    ...tokens.elevation.card,
  },
});
