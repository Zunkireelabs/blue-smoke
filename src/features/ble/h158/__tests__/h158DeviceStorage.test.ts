import AsyncStorage from '@react-native-async-storage/async-storage';
import { addPairedH158Device, getPairedH158Devices, removePairedH158Device } from '../h158DeviceStorage';

describe('h158DeviceStorage', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
  });

  it('reports no remembered devices when nothing has been written yet', async () => {
    expect(await getPairedH158Devices()).toEqual([]);
  });

  it('remembers a paired device, stamped with the moment it connected', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await addPairedH158Device({ id: 'abc-123', name: 'YP65-AT-1234' });
    expect(await getPairedH158Devices()).toEqual([
      { id: 'abc-123', name: 'YP65-AT-1234', lastConnectedAt: 1_000 },
    ]);
    nowSpy.mockRestore();
  });

  it('remembers more than one device at once — the whole point of P1-5.0', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    await addPairedH158Device({ id: 'device-a', name: 'YP65-AT-AAAA' });
    await addPairedH158Device({ id: 'device-b', name: 'YP65-AT-BBBB' });
    expect(await getPairedH158Devices()).toEqual([
      { id: 'device-a', name: 'YP65-AT-AAAA', lastConnectedAt: 1_000 },
      { id: 'device-b', name: 'YP65-AT-BBBB', lastConnectedAt: 2_000 },
    ]);
    nowSpy.mockRestore();
  });

  it('upserts by id — pairing the same unit again updates its entry (and its timestamp) rather than duplicating it', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(5_000);
    await addPairedH158Device({ id: 'abc-123', name: 'YP65-AT-1234' });
    await addPairedH158Device({ id: 'abc-123', name: 'YP65-AT-1234 (renamed by the device)' });
    expect(await getPairedH158Devices()).toEqual([
      { id: 'abc-123', name: 'YP65-AT-1234 (renamed by the device)', lastConnectedAt: 5_000 },
    ]);
    nowSpy.mockRestore();
  });

  it('forgets one device without touching the others', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    await addPairedH158Device({ id: 'device-a', name: 'YP65-AT-AAAA' });
    await addPairedH158Device({ id: 'device-b', name: 'YP65-AT-BBBB' });
    await removePairedH158Device('device-a');
    expect(await getPairedH158Devices()).toEqual([
      { id: 'device-b', name: 'YP65-AT-BBBB', lastConnectedAt: 2_000 },
    ]);
    nowSpy.mockRestore();
  });

  it('back-fills lastConnectedAt for a legacy row written before that field existed', async () => {
    // Simulates real data left over from before `lastConnectedAt` was added (2026-08-31) — not
    // a hypothetical, this is exactly what a dev's existing local AsyncStorage looked like and
    // caused `HomeScreen.tsx`'s `formatLastConnected` to render a literal "Last connected NaNd
    // ago" (`Date.now() - undefined` is `NaN`).
    await AsyncStorage.setItem('h158.pairedDevices.v1', JSON.stringify([{ id: 'legacy-1', name: 'YP65-AT-OLD' }]));
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(9_000);
    expect(await getPairedH158Devices()).toEqual([{ id: 'legacy-1', name: 'YP65-AT-OLD', lastConnectedAt: 9_000 }]);
    nowSpy.mockRestore();
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
