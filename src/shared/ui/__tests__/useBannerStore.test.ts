import { useBannerStore, showBanner, clearBanner, __resetBannerStoreForTests } from '../useBannerStore';

describe('useBannerStore', () => {
  beforeEach(() => {
    __resetBannerStoreForTests();
  });

  test('starts with no message', () => {
    expect(useBannerStore.getState().message).toBeNull();
  });

  test('showBanner sets the message', () => {
    showBanner({ id: 'a', text: 'Hello' });
    expect(useBannerStore.getState().message).toEqual({ id: 'a', text: 'Hello' });
  });

  test('a second showBanner replaces the first, regardless of id', () => {
    showBanner({ id: 'a', text: 'First' });
    showBanner({ id: 'b', text: 'Second' });
    expect(useBannerStore.getState().message).toEqual({ id: 'b', text: 'Second' });
  });

  test('clearBanner with no id always clears', () => {
    showBanner({ id: 'a', text: 'Hello' });
    clearBanner();
    expect(useBannerStore.getState().message).toBeNull();
  });

  test('clearBanner with a matching id clears', () => {
    showBanner({ id: 'a', text: 'Hello' });
    clearBanner('a');
    expect(useBannerStore.getState().message).toBeNull();
  });

  test('clearBanner with a non-matching id is a no-op — a later banner is not clobbered', () => {
    showBanner({ id: 'a', text: 'First' });
    showBanner({ id: 'b', text: 'Second' });
    clearBanner('a');
    expect(useBannerStore.getState().message).toEqual({ id: 'b', text: 'Second' });
  });
});
