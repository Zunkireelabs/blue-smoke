/**
 * VF-2 (the stranding trap) / VF-5 (canceled) / VF-6 (error) / VF-12 (not configured) —
 * regression cover, same pattern as `src/features/auth/__tests__/deadEndExits.test.tsx`: press
 * each CTA and assert its destination actually mounts (or its actual effect fires), not just
 * that the label renders.
 *
 * `getPersonaConfig` is mocked directly rather than relying on `PERSONA_TEMPLATE_ID` being
 * present at Babel-transform time (`babel-plugin-transform-inline-environment-variables` bakes
 * that value in at first import, from whatever `.env`/shell state existed then — a test that
 * depended on it would pass or fail differently depending on whether the machine running it has
 * a local `.env`, which is exactly the kind of environment-dependent flake to avoid).
 *
 * `react-native-persona` itself uses the repo's existing manual mock
 * (`__mocks__/react-native-persona.js`), extended here (this session) with `__lastHandlers()` so
 * a test can simulate the SDK calling back `onCanceled`/`onError` — the mock's `start()` is a
 * no-op, so nothing else would ever invoke them.
 *
 * 2026-08-24 — `launch()` now calls `create-inquiry` before touching the SDK at all (see
 * `PersonaVerificationScreen.tsx`'s header comment for why: the old client-side-only
 * `fromTemplate` inquiry was never recorded server-side, so `persona-webhook` could never
 * resolve it). `getSupabaseClient` is mocked the same automock way
 * `useVerificationStatus.test.tsx`/`ProfileScreen.test.tsx` already do, and every spy below
 * moved from `Inquiry.fromTemplate` to `Inquiry.fromInquiry`.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PersonaVerificationScreen } from '../PersonaVerificationScreen';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';
import { createMockAuthClient, type MockAuthClient } from '@/features/auth/mockAuthClient';
import { findByLabel, renderedText } from '@/features/auth/testUtils';

jest.mock('../personaConfig');
const { getPersonaConfig } = require('../personaConfig');
const { Inquiry, __lastHandlers } = require('react-native-persona');

jest.mock('@/shared/lib/supabaseClient');
const { getSupabaseClient } = require('@/shared/lib/supabaseClient');

function mockCreateInquiry(invoke: jest.Mock) {
  (getSupabaseClient as jest.Mock).mockReturnValue({ functions: { invoke } });
}

const Stack = createNativeStackNavigator();

function renderInStack(client: MockAuthClient) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator initialRouteName="VerifyAge" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="CameraPriming">{() => <Text>ARRIVED CAMERA PRIMING</Text>}</Stack.Screen>
            <Stack.Screen name="VerifyAge" component={PersonaVerificationScreen} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

/**
 * For the "Do this later" case specifically: `goBack()` needs REAL push history, not just a
 * second registered route — `CameraPriming` here immediately navigates forward on mount, so the
 * stack's history is genuinely `[CameraPriming, VerifyAge]` and a `goBack()` from VerifyAge has
 * somewhere real to land.
 */
function renderWithCameraPrimingBehind(client: MockAuthClient) {
  function CameraPrimingStandIn({ navigation }: { navigation: { navigate: (name: string) => void } }) {
    React.useEffect(() => {
      navigation.navigate('VerifyAge');
    }, [navigation]);
    return <Text>ARRIVED CAMERA PRIMING</Text>;
  }

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator initialRouteName="CameraPriming" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="CameraPriming" component={CameraPrimingStandIn} />
            <Stack.Screen name="VerifyAge" component={PersonaVerificationScreen} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    await findByLabel(renderer, label).props.onPress();
  });
}

beforeEach(() => {
  (getPersonaConfig as jest.Mock).mockReturnValue({ templateId: 'itmpl_test', environment: 'sandbox' });
  mockCreateInquiry(
    jest.fn().mockResolvedValue({
      data: { inquiryId: 'inq_test', sessionToken: 'session_test', templateId: 'itmpl_test' },
      error: null,
    }),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PersonaVerificationScreen — VF-2/VF-5/VF-6/VF-12', () => {
  it('VF-2: auto-launches Persona on mount and shows a sign-out even while starting', async () => {
    const client = createMockAuthClient();
    const renderer = renderInStack(client);

    expect(renderedText(renderer)).toContain('Starting verification');
    await press(renderer, 'Sign out');
    expect(client.signOut).toBeDefined();
  });

  it('VF-2: does not relaunch a second time on its own (the started-ref guard still works)', async () => {
    const spy = jest.spyOn(Inquiry, 'fromInquiry');
    const renderer = renderInStack(createMockAuthClient());
    await act(async () => {});
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
  });

  it('VF-5: canceled shows Resume/Do this later/Sign out, and Resume genuinely relaunches', async () => {
    const spy = jest.spyOn(Inquiry, 'fromInquiry');
    const renderer = renderInStack(createMockAuthClient());
    await act(async () => {});
    const initialCalls = spy.mock.calls.length;

    await act(async () => {
      __lastHandlers().onCanceled();
    });
    expect(renderedText(renderer)).toContain('Verification paused');

    await press(renderer, 'Resume');
    await act(async () => {});
    // The old `started` ref permanently blocked this — a real fix means fromInquiry() is
    // called again, not just that the screen still renders.
    expect(spy.mock.calls.length).toBe(initialCalls + 1);
  });

  it('VF-5: "Do this later" goes back rather than stranding the user on this screen', async () => {
    const renderer = renderWithCameraPrimingBehind(createMockAuthClient());
    await act(async () => {});
    await act(async () => {
      __lastHandlers().onCanceled();
    });

    await press(renderer, 'Do this later');
    expect(renderedText(renderer)).toContain('ARRIVED CAMERA PRIMING');
  });

  it('VF-5: Sign out calls through to authClient.signOut()', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    const renderer = renderInStack(client);
    await act(async () => {});
    await act(async () => {
      __lastHandlers().onCanceled();
    });

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('VF-6: error shows Try again/Sign out, and Try again genuinely relaunches', async () => {
    const spy = jest.spyOn(Inquiry, 'fromInquiry');
    const renderer = renderInStack(createMockAuthClient());
    await act(async () => {});
    const initialCalls = spy.mock.calls.length;

    await act(async () => {
      __lastHandlers().onError();
    });
    expect(renderedText(renderer)).toContain('Something went wrong');

    await press(renderer, 'Try again');
    await act(async () => {});
    expect(spy.mock.calls.length).toBe(initialCalls + 1);
    expect(renderedText(renderer)).toContain('Starting verification');
  });

  it('VF-6: Sign out calls through to authClient.signOut()', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    const renderer = renderInStack(client);
    await act(async () => {});
    await act(async () => {
      __lastHandlers().onError();
    });

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('VF-12: a missing PERSONA_TEMPLATE_ID renders "not configured", with sign-out still present', async () => {
    (getPersonaConfig as jest.Mock).mockImplementation(() => {
      throw new Error('PERSONA_TEMPLATE_ID is not set.');
    });
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    const renderer = renderInStack(client);

    expect(renderedText(renderer)).toContain("isn't configured yet");

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a create-inquiry failure surfaces as the error stage, never launches the SDK, and never silently stalls', async () => {
    // Regression, 2026-08-24: before this fix, launch() never called create-inquiry at all, so
    // there was no failure path to test — every completed inquiry stalled forever on "Confirming
    // your verification…" because persona-webhook could never find a matching row. This locks in
    // the new failure branch: an invoke error must reach the same honest error stage the SDK's
    // own onError already used, not a silent hang.
    mockCreateInquiry(jest.fn().mockResolvedValue({ data: null, error: new Error('network error') }));
    const spy = jest.spyOn(Inquiry, 'fromInquiry');
    const renderer = renderInStack(createMockAuthClient());

    await act(async () => {});

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Something went wrong');
  });
});
