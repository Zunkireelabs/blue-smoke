/**
 * Dev-only harness that makes P1-7.0's connection lifecycle visible in the
 * running app: connect, voluntary disconnect, an involuntary drop, and the
 * bounded reconnect-with-backoff that follows one.
 *
 * 🔴 This is a DEVELOPER TOOL, not a product screen. It is mounted under
 * `__DEV__` only (navigation.tsx) and it talks to `createDevFakeManager()`,
 * never to a radio. Nothing here is evidence that BLE works on hardware —
 * §12.1's Definition of Done still requires a physical device on both
 * platforms, and `tools/mock-peripheral` remains the target for the §4 byte
 * layouts. What this *does* prove is that the state machine behaves the same
 * in Hermes as it does under Jest.
 *
 * §7.1 restated, because a screen with a "Connected" badge invites the wrong
 * reading: the firmware dead-man timer is what makes the device safe.
 * Reconnecting only makes relock feel fast. This screen shows link state and
 * deliberately shows no lock state at all — lock state is notification-driven
 * and belongs to `commands.ts`, which is not built.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, tokens } from '@/shared/ui';
import { createConnectionManager, type ConnectionState } from './connection';
import { createDevFakeManager, type NextConnectOutcome } from './devFakeManager';

const DEMO_DEVICE_ID = 'demo-device-0001';
const MAX_LOG_LINES = 40;

/** Monotonic counter for log ordering — no wall-clock, so the log reads the same on every run. */
let logSequence = 0;

interface LogLine {
  id: number;
  text: string;
}

export function BleDemoScreen() {
  // One fake + one manager for the lifetime of the screen. Rebuilding either
  // on re-render would silently reset the state machine mid-demo.
  const { manager, controls } = useMemo(() => createDevFakeManager(), []);
  const connectionManager = useMemo(() => createConnectionManager(manager), [manager]);

  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lifecycle, setLifecycle] = useState<'foreground' | 'background'>('foreground');
  const [nextOutcome, setNextOutcome] = useState<NextConnectOutcome>('success');
  const [log, setLog] = useState<LogLine[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const appendLog = useCallback((text: string) => {
    logSequence += 1;
    setLog((previous) => [...previous, { id: logSequence, text }].slice(-MAX_LOG_LINES));
  }, []);

  useEffect(() => {
    appendLog('ready — fake device, no radio');
    const unsubscribe = connectionManager.onStateChange(DEMO_DEVICE_ID, (next) => {
      setState(next);
      appendLog(`state → ${next}   (connect attempts: ${controls.getConnectAttempts()})`);
    });
    return unsubscribe;
  }, [connectionManager, controls, appendLog]);

  const handleConnect = useCallback(() => {
    appendLog(`connect() requested — next outcome: ${controls.getNextConnectOutcome()}`);
    // Fire-and-forget by design: `connect()` rejects with a typed
    // ConnectionAttemptError, and the state machine has already driven the UI
    // back to 'disconnected' by the time it does. Logging the reason is all
    // that is left to do here.
    connectionManager.connect(DEMO_DEVICE_ID).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'unknown error';
      appendLog(`connect() rejected — ${reason}`);
    });
  }, [connectionManager, controls, appendLog]);

  const handleDisconnect = useCallback(() => {
    appendLog('disconnect() requested — voluntary, must NOT reconnect');
    connectionManager.disconnect(DEMO_DEVICE_ID).catch(() => {});
  }, [connectionManager, appendLog]);

  const handleSimulateDrop = useCallback(() => {
    if (!controls.isConnected()) {
      appendLog('drop ignored — nothing is connected');
      return;
    }
    appendLog('link dropped (supervision timeout) — expect reconnect');
    controls.simulateDrop();
  }, [controls, appendLog]);

  const handleCycleOutcome = useCallback(() => {
    const order: NextConnectOutcome[] = ['success', 'fail', 'hang'];
    const next = order[(order.indexOf(nextOutcome) + 1) % order.length];
    setNextOutcome(next);
    controls.setNextConnectOutcome(next);
    appendLog(`next connect will: ${next}`);
  }, [nextOutcome, controls, appendLog]);

  const handleToggleLifecycle = useCallback(() => {
    const next = lifecycle === 'foreground' ? 'background' : 'foreground';
    setLifecycle(next);
    connectionManager.setAppLifecycleState(next);
    appendLog(`app → ${next}${next === 'background' ? ' (reconnects suspended)' : ' (reconnects resume)'}`);
  }, [lifecycle, connectionManager, appendLog]);

  return (
    <Screen scroll centered={false}>
      <Card style={styles.statusCard}>
        <Text variant="caption" tone="secondary">
          CONNECTION STATE
        </Text>
        <Text variant="title">{state}</Text>
        <Text variant="caption" tone="secondary">
          device {DEMO_DEVICE_ID} · app {lifecycle} · next connect: {nextOutcome}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button label="Connect" onPress={handleConnect} />
        <Button label="Disconnect (voluntary)" onPress={handleDisconnect} />
        <Button label="Simulate dropped link" onPress={handleSimulateDrop} />
        <Button label={`Next connect: ${nextOutcome} — tap to change`} onPress={handleCycleOutcome} />
        <Button
          label={lifecycle === 'foreground' ? 'Send app to background' : 'Bring app to foreground'}
          onPress={handleToggleLifecycle}
        />
      </View>

      <Card style={styles.logCard}>
        <Text variant="caption" tone="secondary">
          EVENT LOG
        </Text>
        <ScrollView
          ref={scrollRef}
          style={styles.logScroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {log.map((line) => (
            <Text key={line.id} variant="caption" style={styles.logLine}>
              {line.text}
            </Text>
          ))}
        </ScrollView>
      </Card>

      <Text variant="caption" tone="secondary" style={styles.footnote}>
        Fake device — no Bluetooth radio is involved. Proves the P1-7.0 state machine, not hardware.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: { gap: tokens.spacing.xs, marginBottom: tokens.spacing.lg },
  actions: { gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg },
  logCard: { gap: tokens.spacing.xs },
  logScroll: { maxHeight: 220 },
  logLine: { paddingVertical: 2 },
  footnote: { marginTop: tokens.spacing.lg, textAlign: 'center' },
});
