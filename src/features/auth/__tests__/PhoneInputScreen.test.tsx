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

const Stack = createNativeStackNavigator<Pick<RootStackParamList, 'PhoneInput' | 'OtpVerify'>>();

function OtpVerifyPlaceholder({ route }: { route: RouteProp<RootStackParamList, 'OtpVerify'> }) {
  return <Text>{`OTP SCREEN ${route.params.phone}`}</Text>;
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
      await findByLabel(renderer, 'Send code').props.onPress();
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
      await findByLabel(renderer, 'Send code').props.onPress();
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
      await findByLabel(renderer, 'Send code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Rate limited.');
  });
});
