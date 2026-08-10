import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenOnboarding, markOnboardingSeen } from '../onboardingStorage';

describe('onboardingStorage', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
  });

  it('reports unseen when nothing has been written yet', async () => {
    expect(await hasSeenOnboarding()).toBe(false);
  });

  it('reports seen after markOnboardingSeen', async () => {
    await markOnboardingSeen();
    expect(await hasSeenOnboarding()).toBe(true);
  });
});
