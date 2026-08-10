/**
 * Regression cover for the three dead ends fixed in P0-7.0 A4 — `AU-3`, `AU-9`, `AU-11`.
 *
 * ── Why this file exists separately ───────────────────────────────────────────────────
 *
 * Each screen's own suite was updated to wrap in a `NavigationContainer` so the new buttons
 * don't throw at render. That proves the button EXISTS. It does not prove the button GOES
 * anywhere — and "renders a label" was exactly the state these three screens were already in
 * before the fix: a success message the user could not leave except via the native back arrow.
 *
 * So these tests press each CTA and assert the destination actually mounts. A future refactor
 * that drops the `onPress`, or points it at a route that isn't registered, fails here rather
 * than silently restoring the dead end.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PasswordResetRequestScreen } from '../PasswordResetRequestScreen';
import { ResetPasswordConfirmScreen } from '../ResetPasswordConfirmScreen';
import { SignupScreen } from '../SignupScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient, type MockAuthClient } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

const Stack = createNativeStackNavigator();

/**
 * Mounts the screen under test inside a stack that also registers stand-ins for the routes its
 * exit CTAs target, so "did we actually get there" is observable as rendered text.
 */
function renderInStack(
  name: string,
  Component: React.ComponentType,
  client: MockAuthClient,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name={name} component={Component} />
            <Stack.Screen name="Login">{() => <Text>ARRIVED LOGIN</Text>}</Stack.Screen>
            <Stack.Screen name="PhoneInput">{() => <Text>ARRIVED PHONE</Text>}</Stack.Screen>
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

async function type(renderer: ReactTestRenderer.ReactTestRenderer, field: string, value: string) {
  await act(async () => {
    findInput(renderer, field).props.onChangeText(value);
  });
}

describe('AU-9 — "Check your email" (password reset) is escapable', () => {
  it('Back to log in reaches the Login route', async () => {
    const client = createMockAuthClient();
    const renderer = renderInStack('PasswordReset', PasswordResetRequestScreen, client);

    await type(renderer, 'Email', 'someone@example.com');
    await press(renderer, 'Send reset link');
    expect(renderedText(renderer)).toContain('Check your email');

    await press(renderer, 'Back to log in');
    expect(renderedText(renderer)).toContain('ARRIVED LOGIN');
  });
});

describe('AU-11 — "Password updated" is escapable', () => {
  it('Continue reaches the Login route', async () => {
    const client = createMockAuthClient();
    const renderer = renderInStack('ResetPasswordConfirm', ResetPasswordConfirmScreen, client);

    await type(renderer, 'New password', 'newpassword123');
    await type(renderer, 'Confirm new password', 'newpassword123');
    await press(renderer, 'Update password');
    expect(renderedText(renderer)).toContain('Password updated');

    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('ARRIVED LOGIN');
  });
});

describe('AU-3 — "Check your email" (signup) is escapable', () => {
  async function reachCheckEmail(client: MockAuthClient) {
    const renderer = renderInStack('Signup', SignupScreen, client);
    await type(renderer, 'Email', 'new@example.com');
    await type(renderer, 'Password', 'password123');
    await type(renderer, 'Confirm password', 'password123');
    await press(renderer, 'Sign up');
    return renderer;
  }

  it('Use phone instead reaches the PhoneInput route', async () => {
    const client = createMockAuthClient({ requireEmailConfirmation: true });
    const renderer = await reachCheckEmail(client);
    expect(renderedText(renderer)).toContain('Check your email');

    await press(renderer, 'Use phone instead');
    expect(renderedText(renderer)).toContain('ARRIVED PHONE');
  });

  it('Resend calls the AuthClient rather than being a button that does nothing', async () => {
    const client = createMockAuthClient({ requireEmailConfirmation: true });
    const spy = jest.spyOn(client, 'resendSignupConfirmation');
    const renderer = await reachCheckEmail(client);

    await press(renderer, 'Resend');

    // The bug this guards: a Resend that renders "sent" without calling anything.
    expect(spy).toHaveBeenCalledWith('new@example.com');
  });

  it('Change email address returns to the form instead of stranding the user', async () => {
    const client = createMockAuthClient({ requireEmailConfirmation: true });
    const renderer = await reachCheckEmail(client);

    await press(renderer, 'Change email address');

    expect(renderedText(renderer)).not.toContain('Check your email');
    expect(renderedText(renderer)).toContain('Create account');
  });
});
