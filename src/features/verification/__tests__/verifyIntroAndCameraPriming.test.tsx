/**
 * VF-1 (VerifyIntroScreen) and ON-5 (CameraPrimingScreen) — same press-and-assert-destination
 * pattern as `src/features/auth/__tests__/deadEndExits.test.tsx`. Both are new this phase, so
 * there is no pre-existing dead end to regress against, but the project's history (three
 * shipped "renders but goes nowhere" buttons) is exactly why every new CTA gets one of these.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { VerifyIntroScreen } from '../VerifyIntroScreen';
import { CameraPrimingScreen } from '../CameraPrimingScreen';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';
import { createMockAuthClient, type MockAuthClient } from '@/features/auth/mockAuthClient';
import { renderedText } from '@/features/auth/testUtils';

const Stack = createNativeStackNavigator();

function renderVerifyStack(client: MockAuthClient) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <AuthClientProvider client={client}>
          <Stack.Navigator initialRouteName="VerifyIntro" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="VerifyIntro" component={VerifyIntroScreen} />
            <Stack.Screen name="CameraPriming" component={CameraPrimingScreen} />
            <Stack.Screen name="VerifyAge">{() => <Text>ARRIVED VERIFY AGE</Text>}</Stack.Screen>
          </Stack.Navigator>
        </AuthClientProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

// `native-stack` keeps a blurred screen mounted underneath the one pushed on top of it (no
// `unmountOnBlur`), so once this test has walked VF-1 -> ON-5, BOTH screens' "Continue"/"Sign
// out" `Pressable`s are simultaneously in the tree — each matched three times over besides
// (the `Pressable` itself, plus the `View`s it renders down to, which repeat the same
// `accessibilityLabel` but have no `onPress`). Filtering to instances that actually have an
// `onPress`, then taking the last one, presses the most-recently-pushed (currently on screen)
// button rather than a stale one underneath it.
async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    const matches = renderer.root
      .findAllByProps({ accessibilityLabel: label })
      .filter((instance) => typeof instance.props.onPress === 'function');
    await matches[matches.length - 1].props.onPress();
  });
}

describe('VF-1 — VerifyIntroScreen', () => {
  it('Continue reaches ON-5 (CameraPriming)', async () => {
    const renderer = renderVerifyStack(createMockAuthClient());
    expect(renderedText(renderer)).toContain("Let's check you're 18 or over");

    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('Camera access');
  });

  it('Sign out calls through to authClient.signOut()', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    const renderer = renderVerifyStack(client);

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('ON-5 — CameraPrimingScreen', () => {
  async function reachCameraPriming(client: MockAuthClient) {
    const renderer = renderVerifyStack(client);
    await press(renderer, 'Continue');
    return renderer;
  }

  it('Continue reaches VF-2 (VerifyAge)', async () => {
    const renderer = await reachCameraPriming(createMockAuthClient());
    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('ARRIVED VERIFY AGE');
  });

  it('"Why do you need this?" returns to VF-1 rather than a dead end', async () => {
    const renderer = await reachCameraPriming(createMockAuthClient());
    await press(renderer, 'Why do you need this?');
    expect(renderedText(renderer)).toContain("Let's check you're 18 or over");
  });

  it('Sign out calls through to authClient.signOut()', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    const renderer = await reachCameraPriming(client);

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
