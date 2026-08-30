import AsyncStorage from '@react-native-async-storage/async-storage';
import { addPairedH158Device, getPairedH158Devices, removePairedH158Device } from '../h158DeviceStorage';

describe('h158DeviceStorage', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
  });

  it('reports no remembered devices when nothing has been written yet', async () => {
    expect(await getPairedH158Devices()).toEqual([]);
  });

  it('remembers a paired device', async () => {
    await addPairedH158Device({ id: 'abc-123', name: 'YP65-AT-1234' });
    expect(await getPairedH158Devices()).toEqual([{ id: 'abc-123', name: 'YP65-AT-1234' }]);
  });

  it('remembers more than one device at once — the whole point of P1-5.0', async () => {
    await addPairedH158Device({ id: 'device-a', name: 'YP65-AT-AAAA' });
    await addPairedH158Device({ id: 'device-b', name: 'YP65-AT-BBBB' });
    expect(await getPairedH158Devices()).toEqual([
      { id: 'device-a', name: 'YP65-AT-AAAA' },
      { id: 'device-b', name: 'YP65-AT-BBBB' },
    ]);
  });

  it('upserts by id — pairing the same unit again updates its entry rather than duplicating it', async () => {
    await addPairedH158Device({ id: 'abc-123', name: 'YP65-AT-1234' });
    await addPairedH158Device({ id: 'abc-123', name: 'YP65-AT-1234 (renamed by the device)' });
    expect(await getPairedH158Devices()).toEqual([
      { id: 'abc-123', name: 'YP65-AT-1234 (renamed by the device)' },
    ]);
  });

  it('forgets one device without touching the others', async () => {
    await addPairedH158Device({ id: 'device-a', name: 'YP65-AT-AAAA' });
    await addPairedH158Device({ id: 'device-b', name: 'YP65-AT-BBBB' });
    await removePairedH158Device('device-a');
    expect(await getPairedH158Devices()).toEqual([{ id: 'device-b', name: 'YP65-AT-BBBB' }]);
  });

  it('treats corrupted stored JSON as no remembered devices', async () => {
    await AsyncStorage.setItem('h158.pairedDevices.v1', 'not-json');
    expect(await getPairedH158Devices()).toEqual([]);
  });

  it('treats a stored non-array as no remembered devices', async () => {
    await AsyncStorage.setItem('h158.pairedDevices.v1', JSON.stringify({ id: 'not-an-array' }));
    expect(await getPairedH158Devices()).toEqual([]);
  });
});
