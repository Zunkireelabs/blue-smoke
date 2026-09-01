import React from 'react';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { Banner } from '../Banner';
import { showBanner, __resetBannerStoreForTests } from '../useBannerStore';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

let renderer: Renderer | undefined;

function render(element: React.ReactElement): Renderer {
  act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer!;
}

/** The composite `Pressable` instance, not its host node — same trap `touchTarget.test.ts`
 * documents (both share `accessibilityRole: 'button'`), except here it's the composite's
 * `onPress` that's actually callable; the host node's is not a plain function. */
function findPressable(r: Renderer) {
  return r.root.findAllByProps({ accessibilityRole: 'button' }).find((n) => typeof n.type !== 'string');
}

describe('Banner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    act(() => {
      __resetBannerStoreForTests();
    });
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = undefined;
    }
    jest.useRealTimers();
  });

  it('renders nothing when there is no message', () => {
    const r = render(<Banner />);
    expect(findPressable(r)).toBeUndefined();
  });

  it('renders the message text once one is shown', () => {
    const r = render(<Banner />);
    act(() => {
      showBanner({ id: 'a', text: 'Device battery low' });
    });
    expect(findPressable(r)).toBeDefined();
    expect(r.root.findByProps({ children: 'Device battery low' })).toBeTruthy();
  });

  it('auto-dismisses after the timeout', () => {
    const r = render(<Banner />);
    act(() => {
      showBanner({ id: 'a', text: 'Device battery low' });
    });
    expect(findPressable(r)).toBeDefined();

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(findPressable(r)).toBeUndefined();
  });

  it('tapping the banner dismisses it and calls onPress', () => {
    const onPress = jest.fn();
    const r = render(<Banner />);
    act(() => {
      showBanner({ id: 'a', text: 'Device connected', onPress });
    });

    const pressable = findPressable(r)!;
    act(() => {
      pressable.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(findPressable(r)).toBeUndefined();
  });
});
