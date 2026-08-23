/**
 * P1-1.0 PR 2 — proves SetPasswordScreen validates password + confirm client-side,
 * calls setPassword, and renders the AuthClient's error verbatim on failure.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SetPasswordScreen } from '../SetPasswordScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findInput, findByLabel, renderedText } from '../testUtils';
import type { RootStackParamList } from '@/app/navigation';

const Stack = createNativeStackNavigator<Pick<RootStackParamList, 'SetPassword'>>();

function renderSetPassword(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return { renderer, client };
}

describe('SetPasswordScreen', () => {
  it('rejects a password under the client-side floor without calling the AuthClient', async () => {
    const { renderer, client } = renderSetPassword();
    const spy = jest.spyOn(client, 'setPassword');

    await act(async () => {
      findInput(renderer, 'New password').props.onChangeText('short1');
      findInput(renderer, 'Confirm password').props.onChangeText('short1');
    });
    await act(async () => {
      await findByLabel(renderer, 'Set password').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Password must be at least 8 characters.');
    // 🔴 Placement, not just presence. `setPasswordSchema` raises this at path
    // ['password'], and an earlier revision rendered every issue under *Confirm
    // password* — pointing the user at the field that is not the problem. Asserting
    // only via renderedText() cannot see that, which is how it went unnoticed.
    expect(findInput(renderer, 'New password').props.error).toBe(
      'Password must be at least 8 characters.',
    );
    expect(findInput(renderer, 'Confirm password').props.error).toBeUndefined();
  });

  it('rejects a mismatched confirmation without calling the AuthClient', async () => {
    const { renderer, client } = renderSetPassword();
    const spy = jest.spyOn(client, 'setPassword');

    await act(async () => {
      findInput(renderer, 'New password').props.onChangeText('longenough1');
      findInput(renderer, 'Confirm password').props.onChangeText('longenough2');
    });
    await act(async () => {
      await findByLabel(renderer, 'Set password').props.onPress();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Passwords do not match.');
    // The mismatch is raised at path ['confirmPassword'], so it belongs on that field
    // and the password field must stay clean.
    expect(findInput(renderer, 'Confirm password').props.error).toBe('Passwords do not match.');
    expect(findInput(renderer, 'New password').props.error).toBeUndefined();
  });

  it('sets the password and shows confirmation on success', async () => {
    const { renderer } = renderSetPassword();

    await act(async () => {
      findInput(renderer, 'New password').props.onChangeText('longenough1');
      findInput(renderer, 'Confirm password').props.onChangeText('longenough1');
    });
    await act(async () => {
      await findByLabel(renderer, 'Set password').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Password set');
  });

  it('renders the AuthClient error verbatim when the request fails', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'setPassword').mockResolvedValue({ ok: false, error: 'Weak password.' });
    const { renderer } = renderSetPassword(client);

    await act(async () => {
      findInput(renderer, 'New password').props.onChangeText('longenough1');
      findInput(renderer, 'Confirm password').props.onChangeText('longenough1');
    });
    await act(async () => {
      await findByLabel(renderer, 'Set password').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Weak password.');
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    jest.spyOn(client, 'setPassword').mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const { renderer } = renderSetPassword(client);

    await act(async () => {
      findInput(renderer, 'New password').props.onChangeText('longenough1');
      findInput(renderer, 'Confirm password').props.onChangeText('longenough1');
    });
    await act(async () => {
      await findByLabel(renderer, 'Set password').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    expect(findByLabel(renderer, 'Set password').props.disabled).toBe(false);
  });
});
