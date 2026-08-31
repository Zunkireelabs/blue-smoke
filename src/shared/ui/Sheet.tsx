import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { tokens } from './tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * `'bottom'` (default) — grab-handle sheet anchored to the bottom edge, unchanged from
   * existing call sites. `'center'` — same backdrop and surface, but presented as a centered
   * dialog card (no grab handle, no slide-from-bottom) for confirmations like Log out that
   * read as a modal decision rather than a drawer. Additive: omitting it preserves every
   * existing caller's behavior exactly.
   */
  position?: 'bottom' | 'center';
}

/**
 * Bottom sheet with a grab handle, for `DV-11` unpair confirm and `PF-7` destructive confirms.
 *
 * The backdrop dims `textPrimary` via the `opacity` *style* property rather than an alpha-
 * blended color — `tokenOnlyGuard` bans literal colors outside `tokens.ts`, and even a token
 * holding a translucent value would break `contrast.test.ts`'s hex parsing. Opacity is a plain
 * style number, not a color, so it sidesteps both.
 */
export function Sheet({ visible, onClose, children, position = 'bottom' }: SheetProps) {
  const isCenter = position === 'center';
  return (
    <Modal
      visible={visible}
      transparent
      animationType={isCenter ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={isCenter ? styles.centerWrap : styles.bottomWrap}>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <View style={isCenter ? styles.centerCard : styles.sheet}>
          {!isCenter && <View style={styles.handle} />}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.textPrimary,
    opacity: 0.5,
  },
  bottomWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.xl,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
  },
  centerCard: {
    width: '100%',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.xl,
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
