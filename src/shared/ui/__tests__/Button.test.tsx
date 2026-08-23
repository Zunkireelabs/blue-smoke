import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { Button } from '../Button';
import { Text } from '../Text';
import { tokens } from '../tokens';

function render(element: React.ReactElement) {
  let renderer!: Renderer;
  act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

function hostButton(renderer: Renderer) {
  return renderer.root.findAllByProps({ accessibilityRole: 'button' }).find((n) => typeof n.type === 'string')!;
}

describe('Button — existing variants unchanged (part 1, "every existing call site must render identically")', () => {
  it('primary variant, default shape: not full-width, brand background', () => {
    const renderer = render(<Button label="Continue" onPress={() => {}} />);
    const style = StyleSheet.flatten(hostButton(renderer).props.style);
    expect(style.backgroundColor).toBe(tokens.color.interactivePrimaryBackground);
    expect(style.width).toBeUndefined();
  });

  it('secondary variant is untouched by the new tone/shape additions', () => {
    const renderer = render(<Button label="Cancel" variant="secondary" onPress={() => {}} />);
    const style = StyleSheet.flatten(hostButton(renderer).props.style);
    expect(style.backgroundColor).toBe(tokens.color.brandTint);
    expect(style.borderColor).toBe(tokens.color.brand);
  });
});

describe('Button — pill shape and on-brand tones (UI-BUILD-E part 1)', () => {
  it('pill shape is full-width', () => {
    const renderer = render(<Button label="Continue" shape="pill" onPress={() => {}} />);
    const style = StyleSheet.flatten(hostButton(renderer).props.style);
    expect(style.width).toBe('100%');
  });

  it('default shape stays non-full-width', () => {
    const renderer = render(<Button label="Continue" onPress={() => {}} />);
    const style = StyleSheet.flatten(hostButton(renderer).props.style);
    expect(style.width).toBeUndefined();
  });

  it('onBrand variant: white pill, brand-coloured label', () => {
    const renderer = render(<Button label="Continue" variant="onBrand" onPress={() => {}} />);
    const style = StyleSheet.flatten(hostButton(renderer).props.style);
    expect(style.backgroundColor).toBe(tokens.color.surface);
    const text = renderer.root.findByType(Text);
    expect(text.props.tone).toBe('link');
  });

  it('textLink variant: no fill, no border, solid white label', () => {
    const renderer = render(<Button label="Not now" variant="textLink" onPress={() => {}} />);
    const style = StyleSheet.flatten(hostButton(renderer).props.style);
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderWidth).toBeUndefined();
    const text = renderer.root.findByType(Text);
    expect(text.props.tone).toBe('inverse');
  });
});
