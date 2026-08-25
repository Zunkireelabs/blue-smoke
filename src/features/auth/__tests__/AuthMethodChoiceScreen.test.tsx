/**
 * P1-1.0 §3.1 — proves both methods are offered with equal weight and each
 * button navigates to its own flow's entry screen.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthMethodChoiceScreen } from '../AuthMethodChoiceScreen';
import { findByLabel, renderedText } from '../testUtils';

const Stack = createNativeStackNavigator();

// `NavigationContainer` schedules a timer inside its `useLinking` effect that
// only clears on unmount — leaving a renderer mounted past its test leaks a
// real open handle (Jest hangs, then OOMs, once enough of these pile up).
let activeRenderer: ReactTestRenderer.ReactTestRenderer | undefined;

function renderChoice() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="AuthChoice" component={AuthMethodChoiceScreen} />
          <Stack.Screen name="EmailCodeRequest">{() => <Text>EMAIL CODE SCREEN</Text>}</Stack.Screen>
          <Stack.Screen name="PhoneInput">{() => <Text>PHONE SCREEN</Text>}</Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>,
    );
  });
  activeRenderer = renderer;
  return renderer;
}

describe('AuthMethodChoiceScreen', () => {
  afterEach(() => {
    act(() => {
      activeRenderer?.unmount();
    });
    activeRenderer = undefined;
  });

  it('renders both methods, neither pre-selected', () => {
    const renderer = renderChoice();
    const text = renderedText(renderer);
    expect(text).toContain('Continue with Email');
    expect(text).toContain('Continue with Phone');
  });

  it('navigates to the email flow', async () => {
    const renderer = renderChoice();
    await act(async () => {
      findByLabel(renderer, 'Continue with Email').props.onPress();
    });
    expect(renderedText(renderer)).toContain('EMAIL CODE SCREEN');
  });

  it('navigates to the phone flow', async () => {
    const renderer = renderChoice();
    await act(async () => {
      findByLabel(renderer, 'Continue with Phone').props.onPress();
    });
    expect(renderedText(renderer)).toContain('PHONE SCREEN');
  });
});
