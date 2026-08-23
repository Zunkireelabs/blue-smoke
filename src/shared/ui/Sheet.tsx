import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { tokens } from './tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet with a grab handle, for `DV-11` unpair confirm and `PF-7` destructive confirms.
 *
 * The backdrop dims `textPrimary` via the `opacity` *style* property rather than an alpha-
 * blended color — `tokenOnlyGuard` bans literal colors outside `tokens.ts`, and even a token
 * holding a translucent value would break `contrast.test.ts`'s hex parsing. Opacity is a plain
 * style number, not a color, so it sidesteps both.
 */
export function Sheet({ visible, onClose, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: tokens.color.textPrimary,
    opacity: 0.5,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.backgroundMuted,
    marginBottom: tokens.spacing.lg,
  },
});
