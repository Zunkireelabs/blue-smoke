import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { tokens } from './tokens';

export interface ErrorStateProps {
  title: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title, body, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text variant="label" tone="danger" style={styles.title}>
        {title}
      </Text>
      {body && (
        <Text variant="body" tone="secondary" style={styles.body}>
          {body}
        </Text>
      )}
      {onRetry && (
        <View style={styles.retry}>
          <Button label={retryLabel} onPress={onRetry} />
        </View>
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
  title: {
    textAlign: 'center',
  },
  body: {
    marginTop: tokens.spacing.sm,
    textAlign: 'center',
  },
  retry: {
    marginTop: tokens.spacing.lg,
  },
});
