import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { tokens } from './tokens';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

/** Hit area is fixed at `tokens.touchTarget` via `minHeight` — same rule as `Button`. */
export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  return (
    <View style={styles.container}>
      {label && (
        <Text variant="label" tone="secondary" style={styles.label}>
          {label}
        </Text>
      )}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={tokens.color.textSecondary}
        {...rest}
      />
      {error && (
        <Text variant="caption" tone="danger" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: tokens.spacing.sm,
  },
  label: {
    marginBottom: tokens.spacing.xs,
  },
  input: {
    minHeight: tokens.touchTarget.minHeight,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radii.md,
    paddingHorizontal: tokens.spacing.md,
    fontSize: tokens.typography.fontSize.body,
    color: tokens.color.textPrimary,
  },
  error: {
    marginTop: tokens.spacing.xs,
  },
});
