import React from 'react';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { PageDots } from '../PageDots';

/**
 * `PageDots` replaces the literal `"1 of 3"` string (part 3). The brief's requirement: a
 * decorative row of dots with no accessible equivalent is a regression, not a restyle — so this
 * asserts the accessible label carries the same "N of M" information, and that the dots
 * themselves are hidden from assistive tech (nothing double-announces).
 */
describe('PageDots', () => {
  it('exposes the current page as an accessible "N of M" label', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(<PageDots count={3} activeIndex={0} />);
    });
    const row = renderer.root.findByProps({ accessibilityLabel: 'Page 1 of 3' });
    expect(row.props.accessible).toBe(true);
  });

  it('updates the label as the active index changes', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(<PageDots count={3} activeIndex={1} />);
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Page 2 of 3' })).toBeTruthy();
  });

  it('renders one dot per count and hides each from assistive tech', () => {
    let renderer!: Renderer;
    act(() => {
      renderer = ReactTestRenderer.create(<PageDots count={4} activeIndex={2} />);
    });
    const hidden = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityElementsHidden === true,
    );
    expect(hidden).toHaveLength(4);
  });
});
