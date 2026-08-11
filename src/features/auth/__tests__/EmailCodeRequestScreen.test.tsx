/**
 * P1-1.0 — proves the email entry screen validates the email, calls the
 * AuthClient's requestEmailCode, and hands off to EmailCodeEntry.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer, type RouteProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { EmailCodeRequestScreen } from '../EmailCodeRequestScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findInput, findByLabel, renderedText } from '../testUtils';
import type { RootStackParamList } from '@/app/navigation';

const Stack = createNativeStackNavigator<
  Pick<RootStackParamList, 'EmailCodeRequest' | 'EmailCodeEntry' | 'PasswordSignIn'>
>();

function EmailCodeEntryPlaceholder({
  route,
}: {
  route: RouteProp<RootStackParamList, 'EmailCodeEntry'>;
}) {
  return <Text>{`CODE SCREEN ${route.params.email}`}</Text>;
}

function PasswordSignInPlaceholder() {
  return <Text>PASSWORD SIGN IN SCREEN</Text>;
}

function renderEmailCodeRequest(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="EmailCodeRequest" component={EmailCodeRequestScreen} />
            <Stack.Screen name="EmailCodeEntry" component={EmailCodeEntryPlaceholder} />
            <Stack.Screen name="PasswordSignIn" component={PasswordSignInPlaceholder} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return { renderer, client };
}

describe('EmailCodeRequestScreen', () => {
  it('rejects an invalid email without calling the AuthClient', async () => {
    const { renderer, client } = renderEmailCodeRequest();
    const spy = jest.spyOn(client, 'requestEmailCode');

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('not-an-email');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send code').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Enter a valid email address.');
  });

  it('requests a code and navigates to EmailCodeEntry on a valid email', async () => {
    const { renderer } = renderEmailCodeRequest();

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('new@example.com');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('CODE SCREEN new@example.com');
  });

  it('renders the AuthClient error verbatim when the request fails', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'requestEmailCode').mockResolvedValue({ ok: false, error: 'Rate limited.' });
    const { renderer } = renderEmailCodeRequest(client);

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('new@example.com');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Rate limited.');
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'requestEmailCode').mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const { renderer } = renderEmailCodeRequest(client);

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('new@example.com');
    });
    await act(async () => {
      await findByLabel(renderer, 'Send code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the button permanently disabled/loading with no way back.
    expect(findByLabel(renderer, 'Send code').props.disabled).toBe(false);
  });

  it('navigates to PasswordSignIn via the subordinate "Use password instead" action', async () => {
    const { renderer, client } = renderEmailCodeRequest();
    const spy = jest.spyOn(client, 'requestEmailCode');

    await act(async () => {
      await findByLabel(renderer, 'Use password instead').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('PASSWORD SIGN IN SCREEN');
  });
});
