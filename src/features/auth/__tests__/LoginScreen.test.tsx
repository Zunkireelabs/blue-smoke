/**
 * P1-1.0 §5 DoD — proves `createMockAuthClient()` drives every LoginScreen
 * state: idle → validation error, idle → submitting → formError (generic,
 * non-enumerating), idle → submitting → signedIn.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { LoginScreen } from '../LoginScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

// NavigationContainer: LoginScreen calls useNavigation() (for the "new
// here" link) - it throws at render time outside one.
function renderLogin(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <LoginScreen />
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

async function fillAndSubmit(
  renderer: ReactTestRenderer.ReactTestRenderer,
  values: { email: string; password: string },
) {
  await act(async () => {
    findInput(renderer, 'Email').props.onChangeText(values.email);
    findInput(renderer, 'Password').props.onChangeText(values.password);
  });
  await act(async () => {
    await findByLabel(renderer, 'Log in').props.onPress();
  });
}

describe('LoginScreen', () => {
  it('shows field validation errors and never calls the AuthClient', async () => {
    const client = createMockAuthClient();
    const signInSpy = jest.spyOn(client, 'signInWithEmail');
    const renderer = renderLogin(client);

    await fillAndSubmit(renderer, { email: 'not-an-email', password: '' });

    expect(signInSpy).not.toHaveBeenCalled();
    const text = renderedText(renderer);
    expect(text).toContain('Enter a valid email address.');
    expect(text).toContain('Enter your password.');
  });

  it('shows the same generic error for an unknown email and a wrong password', async () => {
    const client = createMockAuthClient();
    client.seedEmailAccount('real@example.com', 'correct-password');

    const unknownEmailRenderer = renderLogin(client);
    await fillAndSubmit(unknownEmailRenderer, {
      email: 'nobody@example.com',
      password: 'whatever123',
    });
    const unknownEmailText = renderedText(unknownEmailRenderer);

    const wrongPasswordRenderer = renderLogin(client);
    await fillAndSubmit(wrongPasswordRenderer, {
      email: 'real@example.com',
      password: 'wrong-password',
    });
    const wrongPasswordText = renderedText(wrongPasswordRenderer);

    expect(unknownEmailText).toContain('Incorrect email or password.');
    expect(wrongPasswordText).toContain('Incorrect email or password.');
  });

  it('shows the signedIn state on a correct email + password', async () => {
    const client = createMockAuthClient();
    client.seedEmailAccount('real@example.com', 'correct-password');
    const renderer = renderLogin(client);

    await fillAndSubmit(renderer, { email: 'real@example.com', password: 'correct-password' });

    expect(renderedText(renderer)).toContain('Signed in');
  });
});
