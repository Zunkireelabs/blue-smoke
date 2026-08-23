/**
 * P1-1.0 §3.3 — proves the phone input screen validates via
 * libphonenumber-js, calls the AuthClient's requestPhoneOtp, and hands off
 * to OtpVerify with the parsed E.164 number.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer, type RouteProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PhoneInputScreen } from '../PhoneInputScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findInput, findByLabel, renderedText } from '../testUtils';
import type { RootStackParamList } from '@/app/navigation';

const Stack =
  createNativeStackNavigator<
    Pick<RootStackParamList, 'PhoneInput' | 'OtpVerify' | 'EmailCodeRequest'>
  >();

function OtpVerifyPlaceholder({ route }: { route: RouteProp<RootStackParamList, 'OtpVerify'> }) {
  return <Text>{`OTP SCREEN ${route.params.phone}`}</Text>;
}

function EmailRequestPlaceholder({
  route,
}: {
  route: RouteProp<RootStackParamList, 'EmailCodeRequest'>;
}) {
  return <Text>{`EMAIL SCREEN ${route.params?.mode ?? 'none'}`}</Text>;
}

function renderPhoneInput(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PhoneInput" component={PhoneInputScreen} />
            <Stack.Screen name="OtpVerify" component={OtpVerifyPlaceholder} />
            <Stack.Screen name="EmailCodeRequest" component={EmailRequestPlaceholder} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return { renderer, client };
}

describe('PhoneInputScreen', () => {
  it('rejects an invalid number without calling the AuthClient', async () => {
    const { renderer, client } = renderPhoneInput();
    const spy = jest.spyOn(client, 'requestPhoneOtp');

    await act(async () => {
      findInput(renderer, 'Phone number').props.onChangeText('123');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send verification code').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain(
      'Enter a valid phone number for the selected country.',
    );
  });

  it('requests an OTP and navigates to OtpVerify on a valid number', async () => {
    const { renderer } = renderPhoneInput();

    // A standard NANP-valid (non-toll-free) US number.
    await act(async () => {
      findInput(renderer, 'Phone number').props.onChangeText('2015550123');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send verification code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('OTP SCREEN +12015550123');
  });

  it('renders the AuthClient error verbatim when the request fails', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'requestPhoneOtp').mockResolvedValue({ ok: false, error: 'Rate limited.' });
    const { renderer } = renderPhoneInput(client);

    await act(async () => {
      findInput(renderer, 'Phone number').props.onChangeText('2015550123');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send verification code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Rate limited.');
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'requestPhoneOtp').mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const { renderer } = renderPhoneInput(client);

    await act(async () => {
      findInput(renderer, 'Phone number').props.onChangeText('2015550123');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send verification code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the button permanently disabled/loading with no way back.
    expect(findByLabel(renderer, 'Send verification code').props.disabled).toBe(false);
  });

  /**
   * The reference auth design (2026-08-12) made this screen the auth stack's front door: AU-1's
   * chooser is gone, so the only route to the email path, and the only route between signup and
   * login copy, is on this screen. Both are asserted here because a silently dead link would
   * strand a user with no way to reach the other half of the auth surface.
   */
  describe('as the auth front door', () => {
    it('opens in signup copy and switches to login copy in place', async () => {
      const { renderer } = renderPhoneInput();

      expect(renderedText(renderer)).toContain("Let's create your account");
      expect(renderedText(renderer)).toContain('By signing up');

      await act(async () => {
        findByLabel(renderer, 'Already a user?').props.onPress();
      });

      expect(renderedText(renderer)).toContain('Welcome back, log in to continue');
      expect(renderedText(renderer)).toContain('By signing in');
      // Switching back must be offered, or login is a one-way door.
      expect(findByLabel(renderer, 'New user?')).toBeTruthy();
    });

    it('hands the email path the mode it was showing', async () => {
      const { renderer } = renderPhoneInput();

      await act(async () => {
        findByLabel(renderer, 'Already a user?').props.onPress();
      });
      await act(async () => {
        findByLabel(renderer, 'Email').props.onPress();
      });

      // Not just "it navigated": arriving on the email screen in signup copy after tapping
      // Email from the login screen is the failure this guards.
      expect(renderedText(renderer)).toContain('EMAIL SCREEN signin');
    });
  });
});
