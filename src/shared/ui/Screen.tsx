import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { tokens } from './tokens';
import { GroundStatusBar } from './GroundStatusBar';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Top-level layout wrapper: background token, standard padding, and the
 * `KeyboardAvoidingView` dance every form screen in this codebase already needed by hand
 * (`PhoneInputScreen`, pre-restyle). `scroll` opts into the scrolling variant for screens with
 * a text input; screens without one (e.g. `OtpEntryScreen`) can skip it.
 */
export function Screen({ children, scroll = false, centered = true, style }: ScreenProps) {
  const content = (
    <View style={[styles.content, centered && styles.centered, style]}>{children}</View>
  );
  // Every `Screen` is a flat `background` surface, and several sit under a white React
  // Navigation header (Profile, Set a password) — so the bar must read dark on both.
  const statusBar = <GroundStatusBar topColor={tokens.color.background} />;

  if (!scroll) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {statusBar}
        {content}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {statusBar}
      <ScrollView
        contentContainerStyle={[styles.content, centered && styles.centered, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    flexGrow: 1,
    backgroundColor: tokens.color.background,
    padding: tokens.spacing.xl,
  },
  centered: {
    justifyContent: 'center',
  },
});
