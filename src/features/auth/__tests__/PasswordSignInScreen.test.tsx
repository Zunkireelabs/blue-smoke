/**
 * P1-1.0 PR 2 — proves PasswordSignInScreen validates its fields, calls
 * signInWithEmail, and renders the AuthClient's non-enumerating error verbatim.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PasswordSignInScreen } from '../PasswordSignInScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findInput, findByLabel, renderedText } from '../testUtils';
import type { RootStackParamList } from '@/app/navigation';

const Stack = createNativeStackNavigator<Pick<RootStackParamList, 'PasswordSignIn'>>();

function renderPasswordSignIn(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PasswordSignIn" component={PasswordSignInScreen} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return { renderer, client };
}

describe('PasswordSignInScreen', () => {
  it('rejects an invalid email without calling the AuthClient', async () => {
    const { renderer, client } = renderPasswordSignIn();
    const spy = jest.spyOn(client, 'signInWithEmail');

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('not-an-email');
      findInput(renderer, 'Password').props.onChangeText('whatever');
    });
    await act(async () => {
      await findByLabel(renderer, 'Sign in').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Enter a valid email address.');
  });

  it('rejects an empty password without calling the AuthClient', async () => {
    const { renderer, client } = renderPasswordSignIn();
    const spy = jest.spyOn(client, 'signInWithEmail');

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('someone@example.com');
    });
    await act(async () => {
      await findByLabel(renderer, 'Sign in').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Enter your password.');
  });

  it('signs in on valid credentials', async () => {
    const client = createMockAuthClient();
    client.seedEmailAccount('someone@example.com', { password: 'longenough1' });
    const { renderer } = renderPasswordSignIn(client);

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('someone@example.com');
      findInput(renderer, 'Password').props.onChangeText('longenough1');
    });
    await act(async () => {
      await findByLabel(renderer, 'Sign in').props.onPress();
    });

    expect(renderedText(renderer)).not.toContain('Incorrect email or password.');
  });

  it('renders the AuthClient error verbatim on failure, without enumerating the cause', async () => {
    const client = createMockAuthClient();
    const { renderer } = renderPasswordSignIn(client);

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('nobody@example.com');
      findInput(renderer, 'Password').props.onChangeText('wrongpassword');
    });
    await act(async () => {
      await findByLabel(renderer, 'Sign in').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Incorrect email or password.');
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'signInWithEmail').mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const { renderer } = renderPasswordSignIn(client);

    await act(async () => {
      findInput(renderer, 'Email').props.onChangeText('someone@example.com');
      findInput(renderer, 'Password').props.onChangeText('longenough1');
    });
    await act(async () => {
      await findByLabel(renderer, 'Sign in').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    expect(findByLabel(renderer, 'Sign in').props.disabled).toBe(false);
  });
});
