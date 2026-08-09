import { Platform } from 'react-native';
import { PERMISSIONS, RESULTS, requestMultiple } from 'react-native-permissions';
import { requestBlePermissions } from '../permissions';

// requestMultiple's real type demands every `Permission` key in its resolved Record; the mock
// only ever needs to supply the handful this module actually requests, so it is typed loosely
// rather than fighting that generic in every test case below.
type MockRequestMultiple = (permissions: string[]) => Promise<Record<string, string>>;

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    ANDROID: {
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
  },
  RESULTS: {
    UNAVAILABLE: 'unavailable',
    BLOCKED: 'blocked',
    DENIED: 'denied',
    GRANTED: 'granted',
    LIMITED: 'limited',
  },
  requestMultiple: jest.fn(),
}));

const mockRequestMultiple = requestMultiple as unknown as jest.MockedFunction<MockRequestMultiple>;

describe('requestBlePermissions — iOS', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockRequestMultiple.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  test('is a no-op — resolves granted without calling the library', async () => {
    await expect(requestBlePermissions()).resolves.toBe('granted');
    expect(mockRequestMultiple).not.toHaveBeenCalled();
  });
});

describe('requestBlePermissions — Android API 31+', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });
    mockRequestMultiple.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
  });

  test('requests BLUETOOTH_SCAN and BLUETOOTH_CONNECT, not the pre-31 triad', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.BLUETOOTH_SCAN]: RESULTS.GRANTED,
      [PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]: RESULTS.GRANTED,
    });

    await requestBlePermissions();

    expect(mockRequestMultiple).toHaveBeenCalledWith([
      PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
      PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
    ]);
  });

  test('all granted resolves granted', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.BLUETOOTH_SCAN]: RESULTS.GRANTED,
      [PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]: RESULTS.GRANTED,
    });

    await expect(requestBlePermissions()).resolves.toBe('granted');
  });

  test('one denied resolves denied', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.BLUETOOTH_SCAN]: RESULTS.GRANTED,
      [PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]: RESULTS.DENIED,
    });

    await expect(requestBlePermissions()).resolves.toBe('denied');
  });

  test('one blocked outranks a denied sibling and resolves blocked', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.BLUETOOTH_SCAN]: RESULTS.DENIED,
      [PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]: RESULTS.BLOCKED,
    });

    await expect(requestBlePermissions()).resolves.toBe('blocked');
  });

  test('UNAVAILABLE folds into blocked — re-prompting a nonexistent permission does nothing', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.BLUETOOTH_SCAN]: RESULTS.UNAVAILABLE,
      [PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]: RESULTS.GRANTED,
    });

    await expect(requestBlePermissions()).resolves.toBe('blocked');
  });
});

describe('requestBlePermissions — Android pre-31', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 30, configurable: true });
    mockRequestMultiple.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
  });

  test('requests only ACCESS_FINE_LOCATION, not the API 31+ pair', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]: RESULTS.GRANTED,
    });

    await requestBlePermissions();

    expect(mockRequestMultiple).toHaveBeenCalledWith([PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]);
  });

  test('a granted location permission resolves granted', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]: RESULTS.GRANTED,
    });

    await expect(requestBlePermissions()).resolves.toBe('granted');
  });

  test('a permanently-denied location permission resolves blocked', async () => {
    mockRequestMultiple.mockResolvedValue({
      [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]: RESULTS.BLOCKED,
    });

    await expect(requestBlePermissions()).resolves.toBe('blocked');
  });
});
