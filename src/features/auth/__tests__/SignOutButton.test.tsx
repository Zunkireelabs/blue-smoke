import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SignOutButton } from '../SignOutButton';
import { AuthClientProvider } from '../AuthClientContext';
import { createMockAuthClient } from '../mockAuthClient';
import { findByLabel } from '../testUtils';

describe('SignOutButton', () => {
  it('presses through to authClient.signOut()', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AuthClientProvider client={client}>
          <SignOutButton />
        </AuthClientProvider>,
      );
    });

    await act(async () => {
      await findByLabel(renderer, 'Sign out').props.onPress();
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
