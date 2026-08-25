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
  Pick<RootStackParamList, 'EmailCodeRequest' | 'EmailCodeEntry' | 'PasswordSignIn' | 'PhoneInput'>
>();

function PhoneInputPlaceholder({ route }: { route: RouteProp<RootStackParamList, 'PhoneInput'> }) {
  return <Text>{`PHONE SCREEN ${route.params?.mode ?? 'none'}`}</Text>;
}

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
            <Stack.Screen name="PhoneInput" component={PhoneInputPlaceholder} />
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
      await findByLabel(renderer, 'Get verification code').props.onPress();
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
      await findByLabel(renderer, 'Get verification code').props.onPress();
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
      await findByLabel(renderer, 'Get verification code').props.onPress();
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
      await findByLabel(renderer, 'Get verification code').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Something went wrong. Please try again.');
    // The bug this guards against: a rejected await skips the status reset,
    // leaving the button permanently disabled/loading with no way back.
    expect(findByLabel(renderer, 'Get verification code').props.disabled).toBe(false);
  });

  /**
   * AU-14 stopped being its own screen on 2026-08-12 — password sign-in is a state of this one.
   * These replace the old "navigates to PasswordSignIn" test.
   */
  describe('password state', () => {
    it('swaps the credential in place, keeping the email already typed', async () => {
      const { renderer, client } = renderEmailCodeRequest();
      const spy = jest.spyOn(client, 'requestEmailCode');

      await act(async () => {
        findInput(renderer, 'Email').props.onChangeText('user@example.com');
      });
      await act(async () => {
        await findByLabel(renderer, 'Use password').props.onPress();
      });

      // Same screen, not a navigation — and the address survives the swap, which is the whole
      // point of the reference putting both credentials on one sheet.
      expect(spy).not.toHaveBeenCalled();
      expect(findInput(renderer, 'Email').props.value).toBe('user@example.com');
      expect(findInput(renderer, 'Password')).toBeTruthy();
      expect(findByLabel(renderer, 'Continue')).toBeTruthy();
    });

    it('signs in with the password and never requests a code', async () => {
      const { renderer, client } = renderEmailCodeRequest();
      const codeSpy = jest.spyOn(client, 'requestEmailCode');
      const passwordSpy = jest.spyOn(client, 'signInWithEmail');

      await act(async () => {
        findInput(renderer, 'Email').props.onChangeText('user@example.com');
      });
      await act(async () => {
        await findByLabel(renderer, 'Use password').props.onPress();
      });
      await act(async () => {
        findInput(renderer, 'Password').props.onChangeText('SimWalk!2026aug');
      });
      await act(async () => {
        await findByLabel(renderer, 'Continue').props.onPress();
      });

      expect(passwordSpy).toHaveBeenCalledWith('user@example.com', 'SimWalk!2026aug');
      expect(codeSpy).not.toHaveBeenCalled();
    });

    it('goes back to the code state via "Get code"', async () => {
      const { renderer } = renderEmailCodeRequest();

      await act(async () => {
        await findByLabel(renderer, 'Use password').props.onPress();
      });
      await act(async () => {
        await findByLabel(renderer, 'Get code').props.onPress();
      });

      // Without a way back, choosing password by mistake would strand the user on a credential
      // they may never have set.
      expect(findByLabel(renderer, 'Get verification code')).toBeTruthy();
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Password' })).toHaveLength(0);
    });

    it('masks the password until Show is pressed', async () => {
      const { renderer } = renderEmailCodeRequest();

      await act(async () => {
        await findByLabel(renderer, 'Use password').props.onPress();
      });
      expect(findInput(renderer, 'Password').props.secureTextEntry).toBe(true);

      await act(async () => {
        await findByLabel(renderer, 'Show password').props.onPress();
      });
      expect(findInput(renderer, 'Password').props.secureTextEntry).toBe(false);
    });
  });

  /** Mirrors `PhoneInputScreen`'s own front-door tests — the two screens are each other's only
   *  route to the other channel, so a dead switch on either strands half the auth surface. */
  describe('mode and channel switching', () => {
    it('opens in signup copy and switches to login copy in place', async () => {
      const { renderer } = renderEmailCodeRequest();

      expect(renderedText(renderer)).toContain("Let's create your account");
      expect(renderedText(renderer)).toContain('By signing up');

      await act(async () => {
        findByLabel(renderer, 'Already a user?').props.onPress();
      });

      expect(renderedText(renderer)).toContain('Welcome back, log in to continue');
      expect(renderedText(renderer)).toContain('By signing in');
      expect(findByLabel(renderer, 'New user?')).toBeTruthy();
    });

    it('hands the phone path the mode it was showing', async () => {
      const { renderer } = renderEmailCodeRequest();

      await act(async () => {
        findByLabel(renderer, 'Already a user?').props.onPress();
      });
      await act(async () => {
        findByLabel(renderer, 'Phone number').props.onPress();
      });

      expect(renderedText(renderer)).toContain('PHONE SCREEN signin');
    });
  });
});
