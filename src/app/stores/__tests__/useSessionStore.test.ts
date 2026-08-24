import {
  useSessionStore,
  initSessionListener,
  __resetSessionListenerForTests,
} from '../useSessionStore';

jest.mock('@/shared/lib/supabaseClient');
const { getSupabaseClient } = require('@/shared/lib/supabaseClient');

function mockSupabaseAuth(auth: {
  getSession: jest.Mock;
  onAuthStateChange?: jest.Mock;
}) {
  (getSupabaseClient as jest.Mock).mockReturnValue({
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      ...auth,
    },
  });
}

describe('useSessionStore', () => {
  beforeEach(() => {
    __resetSessionListenerForTests();
  });

  it('starts hydrating, then resolves to signedOut when there is no session', async () => {
    mockSupabaseAuth({ getSession: jest.fn().mockResolvedValue({ data: { session: null } }) });
    expect(useSessionStore.getState().status).toBe('hydrating');

    initSessionListener();
    await flushMicrotasks();

    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('resolves to signedIn when a session is already present', async () => {
    const session = { user: { id: 'user-1' } };
    mockSupabaseAuth({ getSession: jest.fn().mockResolvedValue({ data: { session } }) });

    initSessionListener();
    await flushMicrotasks();

    expect(useSessionStore.getState().status).toBe('signedIn');
    expect(useSessionStore.getState().user).toEqual({ id: 'user-1' });
  });

  it('fails open to signedOut when getSession() rejects, instead of hanging on hydrating forever', async () => {
    // Regression, 2026-08-24: `getSession().then(...)` had no rejection handler, so a
    // storage-adapter read failure (observed on real hardware as react-native-keychain's
    // Android CryptoFailedException — a fingerprint-hardware quirk on that device) left the
    // promise silently rejected and `status` stuck on 'hydrating' forever, which strands the
    // whole app on the boot splash. See `getSupabaseClient` unavailable case just above this
    // call site for the fail-open behaviour this now mirrors.
    mockSupabaseAuth({
      getSession: jest.fn().mockRejectedValue(new Error('CryptoFailedException: code: 1')),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    initSessionListener();
    await flushMicrotasks();

    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('fails open to signedOut when the Supabase client itself is unavailable', async () => {
    (getSupabaseClient as jest.Mock).mockImplementation(() => {
      throw new Error('missing SUPABASE_URL');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    initSessionListener();
    await flushMicrotasks();

    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a second initSessionListener call does not reset an already-resolved status', async () => {
    mockSupabaseAuth({ getSession: jest.fn().mockResolvedValue({ data: { session: null } }) });

    initSessionListener();
    await flushMicrotasks();
    expect(useSessionStore.getState().status).toBe('signedOut');

    initSessionListener();
    await flushMicrotasks();

    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
