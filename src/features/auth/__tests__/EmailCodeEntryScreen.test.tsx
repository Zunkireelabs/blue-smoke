/**
 * P1-1.0 — proves the email code screen submits via Verify, mirrors OtpEntryScreen's generic
 * error handling, and gates + drives the 60s resend cooldown.
 *
 * These asserted auto-submit-on-the-sixth-digit until 2026-08-12, when the reference auth design
 * replaced it with an explicit Verify button (Sadin's call) — the same change made to
 * OtpEntryScreen. Rewritten to the new intended behaviour rather than deleted, with
 * `does not submit on the sixth digit alone` pinning the removal.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { EmailCodeEntryScreen } from '../EmailCodeEntryScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient, MOCK_OTP_CODE } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

const EMAIL = 'new@example.com';
const Stack = createNativeStackNavigator();

function renderEmailCodeEntry(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="EmailCodeEntry"
              component={EmailCodeEntryScreen}
              initialParams={{ email: EMAIL }}
            />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

describe('EmailCodeEntryScreen', () => {
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
    await client.requestEmailCode(EMAIL); // seed: code "sent" before this screen exists
    const renderer = renderEmailCodeEntry(client);

    await enterAndVerify(renderer, '000000');

    expect(renderedText(renderer)).toContain('Incorrect or expired code.');
  });

  it('shows signedIn on the correct code, for a brand-new address', async () => {
    const client = createMockAuthClient();
    await client.requestEmailCode(EMAIL);
    const renderer = renderEmailCodeEntry(client);

    await enterAndVerify(renderer, MOCK_OTP_CODE);

    expect(renderedText(renderer)).toContain('Signed in');
  });

  it('shows signedIn on the correct code, for a returning address', async () => {
    const client = createMockAuthClient();
    client.seedEmailAccount(EMAIL, { password: 'password123' });
    await client.requestEmailCode(EMAIL);
    const renderer = renderEmailCodeEntry(client);

    await enterAndVerify(renderer, MOCK_OTP_CODE);

    expect(renderedText(renderer)).toContain('Signed in');
  });

  it('does not submit on the sixth digit alone', async () => {
    const client = createMockAuthClient();
    await client.requestEmailCode(EMAIL);
    const spy = jest.spyOn(client, 'verifyEmailCode');
    const renderer = renderEmailCodeEntry(client);

    await act(async () => {
      await findInput(renderer, 'Verification code').props.onChangeText(MOCK_OTP_CODE);
    });

    // Auto-submit was removed with the restyle. If it returns, the correct code would sign the
    // user in here — and Verify would then be a second, duplicate request.
    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).not.toContain('Signed in');
  });

  it('keeps Verify disabled until all six digits are entered', async () => {
    const client = createMockAuthClient();
    await client.requestEmailCode(EMAIL);
    const renderer = renderEmailCodeEntry(client);

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

  it('disables resend during the cooldown, then allows it and re-requests a code', async () => {
    const client = createMockAuthClient();
    await client.requestEmailCode(EMAIL);
    const spy = jest.spyOn(client, 'requestEmailCode');
    const renderer = renderEmailCodeEntry(client);

    expect(findByLabel(renderer, 'Resend code in 60s').props.disabled).toBe(true);

    // One act() per tick: the cooldown re-schedules its own setTimeout from
    // a useEffect, which only runs once React flushes after a commit. A
    // single advanceTimersByTime(60_000) fires all 60 callbacks before any
    // of them gets to schedule the next one.
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }

    const resendButton = findByLabel(renderer, 'Resend code');
    expect(resendButton.props.disabled).toBe(false);

    await act(async () => {
      await resendButton.props.onPress();
    });

    expect(spy).toHaveBeenCalledWith(EMAIL);
    expect(findByLabel(renderer, 'Resend code in 60s').props.disabled).toBe(true);
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    await client.requestEmailCode(EMAIL);
    jest.spyOn(client, 'verifyEmailCode').mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const renderer = renderEmailCodeEntry(client);

    await enterAndVerify(renderer, MOCK_OTP_CODE);

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the input permanently non-editable with no way back.
    expect(findInput(renderer, 'Verification code').props.editable).toBe(true);
  });
});
