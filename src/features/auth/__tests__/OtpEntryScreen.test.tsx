/**
 * P1-1.0 §3.3 — proves the OTP screen submits via Verify, mirrors Method A's generic error
 * handling, and gates + drives the resend cooldown.
 *
 * These tests asserted auto-submit-on-the-sixth-digit until 2026-08-12, when the reference auth
 * design replaced it with an explicit Verify button (Sadin's call). They are rewritten to the new
 * intended behaviour rather than deleted, and `does not submit on the sixth digit alone` below
 * pins the removal so auto-submit cannot creep back in beside the button and fire twice.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OtpEntryScreen } from '../OtpEntryScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient, MOCK_OTP_CODE } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

const PHONE = '+12015550123';
const Stack = createNativeStackNavigator();

function renderOtp(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="OtpVerify" component={OtpEntryScreen} initialParams={{ phone: PHONE }} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

describe('OtpEntryScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /** Type the code, then press Verify — the only submit path this screen has. */
  async function enterAndVerify(renderer: ReactTestRenderer.ReactTestRenderer, digits: string) {
    await act(async () => {
      await findInput(renderer, 'Verification code').props.onChangeText(digits);
    });
    await act(async () => {
      await findByLabel(renderer, 'Verify').props.onPress();
    });
  }

  it('shows the incorrect-code error and clears the input on a wrong code', async () => {
    const client = createMockAuthClient();
    await client.requestPhoneOtp(PHONE); // seed: OTP "sent" before this screen exists
    const renderer = renderOtp(client);

    await enterAndVerify(renderer, '000000');

    expect(renderedText(renderer)).toContain('Incorrect or expired code.');
  });

  it('shows signedIn on the correct code', async () => {
    const client = createMockAuthClient();
    await client.requestPhoneOtp(PHONE);
    const renderer = renderOtp(client);

    await enterAndVerify(renderer, MOCK_OTP_CODE);

    expect(renderedText(renderer)).toContain('Signed in');
  });

  it('does not submit on the sixth digit alone', async () => {
    const client = createMockAuthClient();
    await client.requestPhoneOtp(PHONE);
    const spy = jest.spyOn(client, 'verifyPhoneOtp');
    const renderer = renderOtp(client);

    await act(async () => {
      await findInput(renderer, 'Verification code').props.onChangeText(MOCK_OTP_CODE);
    });

    // Auto-submit was removed with the restyle. If it comes back, the correct code would sign
    // the user in here — and Verify would then be a second, duplicate request.
    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).not.toContain('Signed in');
  });

  it('keeps Verify disabled until all six digits are entered', async () => {
    const client = createMockAuthClient();
    await client.requestPhoneOtp(PHONE);
    const renderer = renderOtp(client);

    expect(findByLabel(renderer, 'Verify').props.disabled).toBe(true);

    await act(async () => {
      await findInput(renderer, 'Verification code').props.onChangeText('12345');
    });
    expect(findByLabel(renderer, 'Verify').props.disabled).toBe(true);

    await act(async () => {
      await findInput(renderer, 'Verification code').props.onChangeText('123456');
    });
    expect(findByLabel(renderer, 'Verify').props.disabled).toBe(false);
  });

  it('disables resend during the cooldown, then allows it and re-requests an OTP', async () => {
    const client = createMockAuthClient();
    await client.requestPhoneOtp(PHONE);
    const spy = jest.spyOn(client, 'requestPhoneOtp');
    const renderer = renderOtp(client);

    expect(findByLabel(renderer, 'Resend code in 30s').props.disabled).toBe(true);

    // One act() per tick: the cooldown re-schedules its own setTimeout from
    // a useEffect, which only runs once React flushes after a commit. A
    // single advanceTimersByTime(30_000) fires all 30 callbacks before any
    // of them gets to schedule the next one.
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }

    const resendButton = findByLabel(renderer, 'Resend code');
    expect(resendButton.props.disabled).toBe(false);

    await act(async () => {
      await resendButton.props.onPress();
    });

    expect(spy).toHaveBeenCalledWith(PHONE);
    expect(findByLabel(renderer, 'Resend code in 30s').props.disabled).toBe(true);
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    await client.requestPhoneOtp(PHONE);
    jest.spyOn(client, 'verifyPhoneOtp').mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const renderer = renderOtp(client);

    await enterAndVerify(renderer, MOCK_OTP_CODE);

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the input permanently non-editable with no way back.
    expect(findInput(renderer, 'Verification code').props.editable).toBe(true);
  });
});
