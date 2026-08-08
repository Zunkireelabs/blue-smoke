import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface EmptyStateProps {
  title: string;
  body?: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text variant="label" tone="primary" style={styles.title}>
        {title}
      </Text>
      {body && (
        <Text variant="body" tone="secondary" style={styles.body}>
          {body}
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
  title: {
    textAlign: 'center',
  },
  body: {
    marginTop: tokens.spacing.sm,
    textAlign: 'center',
  },
});
