import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, StyleSheet, Text, View } from 'react-native';

import { PersonaVerificationScreen } from '../features/verification/PersonaVerificationScreen';

/**
 * Root param list — spec §9.2 app/navigation.tsx. Contested shared file
 * (CLAUDE.md): every feature adds its own route here. Add your route and
 * screen, touch nothing else.
 */
export type RootStackParamList = {
  Home: undefined;
  VerifyAge: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  return (
    <View style={styles.container}>
      <Text>BlueSmoke</Text>
      {/* Temporary entry point — P2-1.0 has no post-signup slot yet (Hardik's
          auth branch is unmerged). Becomes a real post-signup step once it lands. */}
      <Button title="Verify your age" onPress={() => navigation.navigate('VerifyAge')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
});

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="VerifyAge"
          component={PersonaVerificationScreen}
          options={{ title: 'Age Verification' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
