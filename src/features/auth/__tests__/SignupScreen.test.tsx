/**
 * P1-1.0 §5 DoD — proves `createMockAuthClient()` drives every SignupScreen
 * state: idle → validation error, idle → submitting → formError,
 * idle → submitting → checkEmail, idle → submitting → signedIn.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { SignupScreen } from '../SignupScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

// NavigationContainer: SignupScreen calls useNavigation() (for the "already
// have an account" link) - it throws at render time outside one.
function renderSignup(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <SignupScreen />
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

async function fillAndSubmit(
  renderer: ReactTestRenderer.ReactTestRenderer,
  values: { email: string; password: string; confirmPassword: string },
) {
  await act(async () => {
    findInput(renderer, 'Email').props.onChangeText(values.email);
    findInput(renderer, 'Password').props.onChangeText(values.password);
    findInput(renderer, 'Confirm password').props.onChangeText(values.confirmPassword);
  });
  await act(async () => {
    await findByLabel(renderer, 'Sign up').props.onPress();
  });
}

describe('SignupScreen', () => {
  it('shows field validation errors and never calls the AuthClient', async () => {
    const client = createMockAuthClient();
    const signUpSpy = jest.spyOn(client, 'signUpWithEmail');
    const renderer = renderSignup(client);

    await fillAndSubmit(renderer, {
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'different',
    });

    expect(signUpSpy).not.toHaveBeenCalled();
    const text = renderedText(renderer);
    expect(text).toContain('Enter a valid email address.');
    expect(text).toContain('Password must be at least 8 characters.');
    expect(text).toContain('Passwords do not match.');
  });

  it('shows the checkEmail state when the mock requires email confirmation', async () => {
    const client = createMockAuthClient({ requireEmailConfirmation: true });
    const renderer = renderSignup(client);

    await fillAndSubmit(renderer, {
      email: 'new@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    expect(renderedText(renderer)).toContain('Check your email');
  });

  it('shows the signedIn state when the mock establishes a session immediately', async () => {
    const client = createMockAuthClient({ requireEmailConfirmation: false });
    const renderer = renderSignup(client);

    await fillAndSubmit(renderer, {
      email: 'new@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    expect(renderedText(renderer)).toContain('Account created');
  });

  it('renders the AuthClient error verbatim on a failed signup', async () => {
    const client = createMockAuthClient();
    client.seedEmailAccount('taken@example.com', 'password123');
    const renderer = renderSignup(client);

    await fillAndSubmit(renderer, {
      email: 'taken@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    expect(renderedText(renderer)).toContain('An account with this email already exists.');
  });
});
