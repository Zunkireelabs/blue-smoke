/**
 * P1-1.0 §5 DoD — proves the mock AuthClient drives every state for the
 * screen the reset-link deep link lands on: validation error, done, and a
 * real failure.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { ResetPasswordConfirmScreen } from '../ResetPasswordConfirmScreen';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findByLabel, findInput, renderedText } from '../testUtils';

// NavigationContainer: AU-11 (P0-7.0) added a "Continue" button, so the
// screen now calls useNavigation() unconditionally — it throws at render
// time outside one, same as Signup/LoginScreen.
function renderScreen(client = createMockAuthClient()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <ResetPasswordConfirmScreen />
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

async function fillAndSubmit(
  renderer: ReactTestRenderer.ReactTestRenderer,
  values: { password: string; confirmPassword: string },
) {
  await act(async () => {
    findInput(renderer, 'New password').props.onChangeText(values.password);
    findInput(renderer, 'Confirm new password').props.onChangeText(values.confirmPassword);
  });
  await act(async () => {
    await findByLabel(renderer, 'Update password').props.onPress();
  });
}

describe('ResetPasswordConfirmScreen', () => {
  it('shows field validation errors and never calls the AuthClient', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'confirmPasswordReset');
    const renderer = renderScreen(client);

    await fillAndSubmit(renderer, { password: 'short', confirmPassword: 'different' });

    expect(spy).not.toHaveBeenCalled();
    const text = renderedText(renderer);
    expect(text).toContain('Password must be at least 8 characters.');
    expect(text).toContain('Passwords do not match.');
  });

  it('shows the done state on success', async () => {
    const renderer = renderScreen();

    await fillAndSubmit(renderer, { password: 'newpassword123', confirmPassword: 'newpassword123' });

    expect(renderedText(renderer)).toContain('Password updated');
  });

  it('renders the AuthClient error verbatim on failure', async () => {
    const client = createMockAuthClient();
    jest
      .spyOn(client, 'confirmPasswordReset')
      .mockResolvedValue({ ok: false, error: 'Recovery session expired.' });
    const renderer = renderScreen(client);

    await fillAndSubmit(renderer, { password: 'newpassword123', confirmPassword: 'newpassword123' });

    expect(renderedText(renderer)).toContain('Recovery session expired.');
  });

  it('recovers from a thrown error instead of stranding the form', async () => {
    const client = createMockAuthClient();
    jest
      .spyOn(client, 'confirmPasswordReset')
      .mockRejectedValue(new Error('SUPABASE_URL is not set'));
    const renderer = renderScreen(client);

    await fillAndSubmit(renderer, { password: 'newpassword123', confirmPassword: 'newpassword123' });

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the button permanently disabled/loading with no way back.
    expect(findByLabel(renderer, 'Update password').props.disabled).toBe(false);
  });
});
