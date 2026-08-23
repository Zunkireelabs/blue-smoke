import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Inquiry } from 'react-native-persona';

import { Button, GradientGround, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import type { RootStackParamList } from '@/app/navigation';
import { getPersonaConfig } from './personaConfig';

type Stage = 'starting' | 'pending' | 'canceled' | 'error' | 'not_configured';

/**
 * VF-2 (F6.4, `SCREEN_MAP.md`) — Persona's SDK host, and (via its `canceled`/`error`/
 * `not_configured` states) VF-5, VF-6, and VF-12. Persona's SDK owns ID + selfie capture
 * entirely — this screen just launches it modally and reacts to the result. `onComplete`'s
 * status is a UI hint only (CLAUDE.md rule 3): it is never treated as an authoritative
 * verification outcome. That authority is the webhook-confirmed backend state (P2-8.0); until
 * then this screen only shows the user where things stand.
 *
 * 🔴 THE STRANDING TRAP, fixed here (`SCREEN_MAP.md`, reproduced on a real device 2026-08-09):
 * every state below now carries a sign-out (F6.Z), and `autoStarted` — the ref that used to
 * permanently block re-running the launch effect — now only gates the ONE automatic launch on
 * mount. `launch()` is a separate function Resume/Try again call directly, so a deliberate
 * user-initiated retry is never blocked by it.
 *
 * Uses Inquiry.fromTemplate(...).build().start() (a modal launch via a plain NativeModules
 * call), not the inline <PersonaInquiryView> component. PersonaInquiryView is registered with
 * requireNativeComponent — the old-architecture way to register a custom native view — and
 * react-native-persona has no Fabric/codegen support even in its latest release (its own
 * devDependency is still pinned to react-native ^0.72.4). React Native 0.82+ made the New
 * Architecture mandatory (newArchEnabled can no longer be disabled), and its Fabric interop
 * layer doesn't reliably cover custom native views with custom children — confirmed by a hard
 * native crash on mount with PersonaInquiryView. The modal `.start()` path only calls a plain
 * native module method, which the interop layer handles fine.
 */
export function PersonaVerificationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [stage, setStage] = useState<Stage>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const launch = useCallback(() => {
    let config;
    try {
      config = getPersonaConfig();
    } catch (err) {
      setErrorMessage((err as Error).message);
      setStage('not_configured');
      return;
    }

    setStage('starting');
    Inquiry.fromTemplate(config.templateId)
      .environment(config.environment)
      .onComplete(() => setStage('pending'))
      .onCanceled(() => setStage('canceled'))
      .onError(() => setStage('error'))
      .build()
      .start();
  }, []);

  useEffect(() => {
    if (autoStarted.current) {
      return;
    }
    autoStarted.current = true;
    launch();
  }, [launch]);

  if (stage === 'starting') {
    return (
      <GradientGround style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text variant="title" style={styles.centerText}>
          Starting verification…
        </Text>
        <View style={styles.actions}>
          <SignOutButton />
        </View>
      </GradientGround>
    );
  }

  if (stage === 'not_configured') {
    return (
      <GradientGround style={styles.centered}>
        <Text variant="title" style={styles.centerText}>
          Verification isn't configured yet
        </Text>
        {errorMessage && (
          <Text variant="body" tone="secondary" style={styles.centerText}>
            {errorMessage}
          </Text>
        )}
        <View style={styles.actions}>
          <SignOutButton />
        </View>
      </GradientGround>
    );
  }

  if (stage === 'pending') {
    return (
      <GradientGround style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text variant="title" style={styles.centerText}>
          Confirming your verification…
        </Text>
        <Text variant="body" tone="secondary" style={styles.centerText}>
          We're checking your submission. This can take a moment — you don't need to do anything
          else right now.
        </Text>
        <View style={styles.actions}>
          <SignOutButton />
        </View>
      </GradientGround>
    );
  }

  if (stage === 'canceled') {
    // VF-5 / F6.C. "Do this later" has nowhere else in-app to send someone — every stack is
    // gated by verification state, so ON-5 (the previous screen) is the only real destination
    // that isn't Resume or Sign out.
    return (
      <GradientGround style={styles.centered}>
        <Text variant="title" style={styles.centerText}>
          Verification paused
        </Text>
        <Text variant="body" tone="secondary" style={styles.centerText}>
          You can pick this up whenever you're ready. Nothing was saved.
        </Text>
        <View style={styles.actions}>
          <Button label="Resume" onPress={launch} />
          <Button label="Do this later" variant="secondary" onPress={() => navigation.goBack()} />
          <SignOutButton />
        </View>
      </GradientGround>
    );
  }

  // VF-6 / F6.E. "Get help" is deliberately omitted: its natural destination is VF-11 (manual
  // review fallback), which is out of scope this phase — blocked on OQ-2 (no owner, channel, or
  // SLA yet, see SCREEN_MAP.md). Wiring it to nothing would recreate exactly the "button that
  // renders but goes nowhere" bug this project has already shipped three times.
  return (
    <GradientGround style={styles.centered}>
      <Text variant="title" style={styles.centerText}>
        Something went wrong
      </Text>
      <Text variant="body" tone="secondary" style={styles.centerText}>
        We couldn't start verification. Please try again in a moment.
      </Text>
      <View style={styles.actions}>
        <Button label="Try again" onPress={launch} />
        <SignOutButton />
      </View>
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
    alignSelf: 'stretch',
  },
});
