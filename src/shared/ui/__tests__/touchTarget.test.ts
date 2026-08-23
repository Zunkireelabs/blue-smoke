import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { BackButton } from '../BackButton';
import { Button } from '../Button';
import { ListRow } from '../ListRow';
import { TextField } from '../TextField';
import { tokens } from '../tokens';

/** iOS HIG minimum is 44x44pt, Android Material minimum is 48x48dp — the stricter of the two
 * is the floor every primitive must clear regardless of which platform the test runs under. */
const MIN_HIT_AREA = 44;

/** `findByProps` throws on more than one match, and both the composite wrapper (React attaches
 * whatever props the caller passed to it) and the host node it forwards to can share a prop —
 * this picks the host (string `type`) instance whose resolved style is the one that matters. */
function findHostByProps(renderer: Renderer, props: Record<string, unknown>) {
  const matches = renderer.root.findAllByProps(props);
  const host = matches.find((instance) => typeof instance.type === 'string');
  if (!host) {
    throw new Error(`No host component found matching ${JSON.stringify(props)}`);
  }
  return host;
}

describe('interactive primitives meet the minimum touch target', () => {
  it('the touchTarget token itself is not below the platform minimum', () => {
    expect(tokens.touchTarget.minHeight).toBeGreaterThanOrEqual(MIN_HIT_AREA);
    expect(tokens.touchTarget.minWidth).toBeGreaterThanOrEqual(MIN_HIT_AREA);
  });

  it('Button resolves to at least the minimum hit area', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(React.createElement(Button, { label: 'Send code', onPress: () => {} }));
    });

    const host = findHostByProps(renderer, { accessibilityRole: 'button' });
    const style = StyleSheet.flatten(host.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_HIT_AREA);
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_HIT_AREA);
  });

  it('ListRow resolves to at least the minimum hit area', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(React.createElement(ListRow, { label: 'My device' }));
    });

    const host = findHostByProps(renderer, { accessibilityRole: 'button' });
    const style = StyleSheet.flatten(host.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_HIT_AREA);
  });

  it('BackButton resolves to at least the minimum hit area', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(React.createElement(BackButton, { onPress: () => {} }));
    });

    const host = findHostByProps(renderer, { accessibilityRole: 'button' });
    const style = StyleSheet.flatten(host.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_HIT_AREA);
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_HIT_AREA);
  });

  it('TextField input resolves to at least the minimum height', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        React.createElement(TextField, { accessibilityLabel: 'Phone number' }),
      );
    });

    const host = findHostByProps(renderer, { accessibilityLabel: 'Phone number' });
    const style = StyleSheet.flatten(host.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_HIT_AREA);
  });
});
