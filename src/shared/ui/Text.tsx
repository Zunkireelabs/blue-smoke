import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';
import { tokens } from './tokens';

type Variant = 'title' | 'body' | 'label' | 'caption';
type Tone = 'primary' | 'secondary' | 'inverse' | 'danger' | 'link';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

/**
 * Every text render in the kit goes through this component so dynamic type keeps working —
 * `allowFontScaling` is never set to `false` here, and none of the callers below should set it
 * either. A layout that can't survive scaled text should wrap, not clip.
 */
export function Text({ variant = 'body', tone = 'primary', style, ...rest }: TextProps) {
  return <RNText style={[styles[variant], toneStyles[tone], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: {
    fontSize: tokens.typography.fontSize.title,
    fontWeight: tokens.typography.fontWeight.semibold,
  },
  body: {
    fontSize: tokens.typography.fontSize.body,
    fontWeight: tokens.typography.fontWeight.regular,
  },
  label: {
    fontSize: tokens.typography.fontSize.label,
    fontWeight: tokens.typography.fontWeight.medium,
  },
  caption: {
    fontSize: tokens.typography.fontSize.caption,
    fontWeight: tokens.typography.fontWeight.regular,
  },
});

const toneStyles = StyleSheet.create({
  primary: { color: tokens.color.textPrimary },
  secondary: { color: tokens.color.textSecondary },
  inverse: { color: tokens.color.textInverse },
  danger: { color: tokens.color.dangerText },
  link: { color: tokens.color.link },
});
