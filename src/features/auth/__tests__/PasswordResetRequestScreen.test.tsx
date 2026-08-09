/**
 * P1-1.0 §5 DoD — proves the mock AuthClient drives every state: validation
 * error, checkEmail (shown identically regardless of whether the email has
 * an account — see the screen's header comment), and a real failure.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { PasswordResetRequestScreen } from '../PasswordResetRequestScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

// NavigationContainer: AU-9 (P0-7.0) added a "Back to log in" button, so the
// screen now calls useNavigation() unconditionally — it throws at render
// time outside one, same as Signup/LoginScreen.
function renderScreen(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <PasswordResetRequestScreen />
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

async function fillAndSubmit(renderer: ReactTestRenderer.ReactTestRenderer, email: string) {
  await act(async () => {
    findInput(renderer, 'Email').props.onChangeText(email);
  });
  await act(async () => {
    await findByLabel(renderer, 'Send reset link').props.onPress();
  });
}

describe('PasswordResetRequestScreen', () => {
  it('shows a validation error and never calls the AuthClient', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'requestPasswordReset');
    const renderer = renderScreen(client);

    await fillAndSubmit(renderer, 'not-an-email');

    expect(spy).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Enter a valid email address.');
  });

  it('shows the same checkEmail state for an unknown email as a real one', async () => {
    const client = createMockAuthClient();
    client.seedEmailAccount('real@example.com', 'password123');

    const knownRenderer = renderScreen(client);
    await fillAndSubmit(knownRenderer, 'real@example.com');

    const unknownRenderer = renderScreen(client);
    await fillAndSubmit(unknownRenderer, 'nobody@example.com');

    expect(renderedText(knownRenderer)).toContain('Check your email');
    expect(renderedText(unknownRenderer)).toContain('Check your email');
  });

  it('renders a real failure verbatim', async () => {
    const client = createMockAuthClient();
    jest
      .spyOn(client, 'requestPasswordReset')
      .mockResolvedValue({ ok: false, error: 'Rate limited.' });
    const renderer = renderScreen(client);

    await fillAndSubmit(renderer, 'real@example.com');

    expect(renderedText(renderer)).toContain('Rate limited.');
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    jest
      .spyOn(client, 'requestPasswordReset')
      .mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const renderer = renderScreen(client);

    await fillAndSubmit(renderer, 'real@example.com');

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the button permanently disabled/loading with no way back.
    expect(findByLabel(renderer, 'Send reset link').props.disabled).toBe(false);
  });
});
