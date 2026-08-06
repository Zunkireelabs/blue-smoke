import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Inquiry } from 'react-native-persona';

import { getPersonaConfig } from './personaConfig';

/**
 * P2-1.0. Persona's SDK owns ID + selfie capture entirely — this screen just
 * launches it modally and reacts to the result. `onComplete`'s status is a
 * UI hint only (CLAUDE.md rule 3): it is never treated as an authoritative
 * verification outcome. That authority is the webhook-confirmed backend
 * state added in a later increment (P2-8.0); until then this screen only
 * shows the user where things stand.
 *
 * Uses Inquiry.fromTemplate(...).build().start() (a modal launch via a
 * plain NativeModules call), not the inline <PersonaInquiryView> component.
 * PersonaInquiryView is registered with requireNativeComponent — the old-
 * architecture way to register a custom native view — and react-native-
 * persona has no Fabric/codegen support even in its latest release (its own
 * devDependency is still pinned to react-native ^0.72.4). React Native
 * 0.82+ made the New Architecture mandatory (newArchEnabled can no longer
 * be disabled), and its Fabric interop layer doesn't reliably cover custom
 * native views with custom children — confirmed by a hard native crash on
 * mount with PersonaInquiryView. The modal `.start()` path only calls a
 * plain native module method, which the interop layer handles fine.
 */
export function PersonaVerificationScreen() {
  const [stage, setStage] = useState<'starting' | 'pending' | 'canceled' | 'error' | 'not_configured'>(
    'starting',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    let config;
    try {
      config = getPersonaConfig();
    } catch (err) {
      setErrorMessage((err as Error).message);
      setStage('not_configured');
      return;
    }

    Inquiry.fromTemplate(config.templateId)
      .environment(config.environment)
      .onComplete(() => setStage('pending'))
      .onCanceled(() => setStage('canceled'))
      .onError(() => setStage('error'))
      .build()
      .start();
  }, []);

  if (stage === 'starting') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (stage === 'not_configured') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Verification isn't configured yet</Text>
        <Text style={styles.body}>{errorMessage}</Text>
      </View>
    );
  }

  if (stage === 'pending') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirming your verification…</Text>
        <Text style={styles.body}>
          We're checking your submission. This can take a moment — you don't need to do
          anything else right now.
        </Text>
      </View>
    );
  }

  if (stage === 'canceled') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Verification not completed</Text>
        <Text style={styles.body}>You can try again whenever you're ready.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>We couldn't start verification. Please try again in a moment.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    color: '#555',
  },
});
