import React from 'react';
import { StyleSheet, Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { ScreenScaffold } from '../ScreenScaffold';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

function render(element: React.ReactElement) {
  let renderer!: Renderer;
  act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

describe('ScreenScaffold', () => {
  it('renders only the slots given', () => {
    const renderer = render(<ScreenScaffold header={<Text>mark</Text>} />);
    expect(renderer.root.findAllByType(Text).map((t) => t.props.children)).toEqual(['mark']);
  });

  it('renders every slot when given', () => {
    const renderer = render(
      <ScreenScaffold
        back={<Text>back</Text>}
        header={<Text>header</Text>}
        body={<Text>body</Text>}
        actions={<Text>actions</Text>}
        footnote={<Text>footnote</Text>}
      />,
    );
    expect(renderer.root.findAllByType(Text).map((t) => t.props.children)).toEqual([
      'back',
      'header',
      'body',
      'actions',
      'footnote',
    ]);
  });

  it('keeps the middle flexible whether or not body is given', () => {
    const flexOneHosts = (renderer: Renderer) =>
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style ?? {}).flex === 1,
      );

    const withoutBody = render(<ScreenScaffold />);
    const withBody = render(<ScreenScaffold body={<Text>body</Text>} />);

    expect(flexOneHosts(withoutBody).length).toBeGreaterThan(0);
    expect(flexOneHosts(withBody).length).toBeGreaterThan(0);
  });

  it('keeps the middle wrapper itself flex: 1 with body absent, not just the outer container', () => {
    // The trap (part 1 review): the outer `container` style is also `flex: 1`, so the test above
    // passes even if `flex: 1` is deleted from `middle` — the container alone satisfies
    // "some host has flex 1". Every slot is omitted here, so the only two hosts left are
    // `container` and `middle`; asserting the count is exactly 2 fails the instant `middle`
    // loses its own `flex: 1`, independent of the container's.
    const renderer = render(<ScreenScaffold />);
    const flexOneHosts = renderer.root.findAll(
      (node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style ?? {}).flex === 1,
    );
    expect(flexOneHosts.length).toBe(2);
  });
});
