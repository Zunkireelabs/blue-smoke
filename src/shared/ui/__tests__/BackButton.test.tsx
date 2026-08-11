import React from 'react';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { BackButton } from '../BackButton';

function render(element: React.ReactElement) {
  let renderer!: Renderer;
  act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

describe('BackButton', () => {
  it('defaults to an accessible "Back" label', () => {
    const renderer = render(<BackButton onPress={() => {}} />);
    const host = renderer.root.findAllByProps({ accessibilityRole: 'button' }).find((n) => typeof n.type === 'string');
    expect(host?.props.accessibilityLabel).toBe('Back');
  });

  it('accepts a custom accessibility label', () => {
    const renderer = render(<BackButton accessibilityLabel="Close" onPress={() => {}} />);
    const host = renderer.root.findAllByProps({ accessibilityRole: 'button' }).find((n) => typeof n.type === 'string');
    expect(host?.props.accessibilityLabel).toBe('Close');
  });
});
