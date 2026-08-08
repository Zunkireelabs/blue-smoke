import { StyleSheet, View, type ViewProps } from 'react-native';
import { tokens } from './tokens';

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.lg,
    ...tokens.elevation.card,
  },
});
