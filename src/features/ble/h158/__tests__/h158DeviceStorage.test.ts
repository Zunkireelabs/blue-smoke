import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLastConnectedH158Device, setLastConnectedH158Device } from '../h158DeviceStorage';

describe('h158DeviceStorage', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
  });

  it('reports no remembered device when nothing has been written yet', async () => {
    expect(await getLastConnectedH158Device()).toBeNull();
  });

  it('round-trips the last connected device', async () => {
    await setLastConnectedH158Device({ id: 'abc-123', name: 'YP65-AT-1234' });
    expect(await getLastConnectedH158Device()).toEqual({ id: 'abc-123', name: 'YP65-AT-1234' });
  });

  it('treats corrupted stored JSON as no remembered device', async () => {
    await AsyncStorage.setItem('h158.lastConnectedDevice.v1', 'not-json');
    expect(await getLastConnectedH158Device()).toBeNull();
  });
});
