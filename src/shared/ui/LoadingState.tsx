import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator color={tokens.color.textPrimary} />
      {message && (
        <Text variant="body" tone="secondary" style={styles.message}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  message: {
    marginTop: tokens.spacing.md,
    textAlign: 'center',
  },
});
