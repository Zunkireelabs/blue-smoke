import { StyleSheet } from 'react-native';
import { CurtainGround } from '@/shared/ui';
import { BluetoothPrimingBody, type BluetoothPrimingBodyProps } from './BluetoothPrimingBody';

export type BluetoothPrimingScreenProps = BluetoothPrimingBodyProps;

/**
 * Built on `CurtainGround` to match Home's own gradient + "BlueSmoke" + curtain shell —
 * `navigation.tsx` gives this screen `headerShown: false` and a slide-from-bottom transition.
 *
 * ⚠️ Unreached from Home's UI as of the "stack a card over Home" redesign: tapping "+" there now
 * opens `BluetoothPrimingBody` inline, over the "Devices" card, instead of navigating here — see
 * `HomeScreen.tsx`. Kept on disk and still registered as the `BluetoothPriming` route (same
 * treatment as `AuthChoice`/`PasswordSignIn` in `navigation.tsx`) since nothing else currently
 * needs it deleted, and `primingScreens.test.tsx` still exercises it directly.
 */
export function BluetoothPrimingScreen({ onContinue, onNotNow }: BluetoothPrimingScreenProps) {
  return (
    <CurtainGround style={styles.curtain}>
      <BluetoothPrimingBody onContinue={onContinue} onNotNow={onNotNow} />
    </CurtainGround>
  );
}

const styles = StyleSheet.create({
  curtain: {
    justifyContent: 'center',
  },
});
