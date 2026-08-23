import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { BrandMark, tokens } from '@/shared/ui';

/**
 * SH-1 — the boot splash (execution brief P0-7.0). Shown while `RootNavigator` is deciding
 * which gated stack to mount: a Keychain read and/or the onboarding-flag read, typically under
 * 400ms. Placement matches `ios/BlueSmoke/LaunchScreen.storyboard` exactly (22% of screen width,
 * optical centre at 48% of screen height, flat white ground) so the native launch frame and this
 * first JS frame read as one continuous moment rather than a jump.
 *
 * 🔴 Renders no text and no controls, deliberately: this mounts before session/verification
 * state is known, so showing the auth stack here would flash a login screen at an
 * already-signed-in user on every cold start. See `__tests__/BootSplashScreen.test.tsx` — that
 * absence is asserted, not just observed, so it survives a future "improvement."
 */
export function BootSplashScreen() {
  const { width, height } = useWindowDimensions();
  const markSize = width * 0.22;
  const markCenterY = height * 0.48;

  return (
    <View style={styles.ground}>
      <View style={[styles.markWrapper, { top: markCenterY - markSize / 2, left: (width - markSize) / 2 }]}>
        <BrandMark size={markSize} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  markWrapper: {
    position: 'absolute',
  },
});
