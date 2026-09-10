import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from './BrandMark';
import { Text } from './Text';
import { tokens } from './tokens';
import { GroundStatusBar } from './GroundStatusBar';

/**
 * The one address a stuck user can write to. Rendered on every auth screen because the
 * reference design pins it to the bottom of each sheet, and a support route that only appears
 * on some screens is one the user finds by luck.
 */
// ⚠️ PLACEHOLDER, not the client's support address. `everestdeploy.com` is OUR deployment
// infrastructure domain — `supabase/README.md` flags in red that production must not present it
// to users, because a domain the user has never heard of reads as a phishing signal, and it is
// not the client's to control or protect. It replaces an agency Gmail, which was no better.
//
// Must be replaced before production. The question has no OQ row and no owner today; it is the
// same class as OQ-7 (brand assets) and OQ-8 (account ownership) and is blocked on both.
const SUPPORT_EMAIL = 'support@everestdeploy.com';

export interface AuthScaffoldProps {
  /**
   * Top-right control on the brand header — "Already a User?" on the signup screens, "New
   * User?" on the login ones. This is the *only* route between the two modes: there is no
   * separate chooser screen (AU-1 was retired when this design landed).
   */
  topLink?: ReactNode;
  /** The sheet's contents. Headline included — the sheet is a blank canvas below the chrome. */
  children: ReactNode;
}

/**
 * The chrome every auth screen shares (reference design, `temp_ss/ui-screens-ref-design/**`):
 * a full-bleed brand header carrying the mark, wordmark and mode switch, and below it a
 * rounded-top sheet holding the form.
 *
 * The split is not decorative. The header is the fixed, non-scrolling part — it stays put when
 * the keyboard opens — while the sheet scrolls and shrinks around it, which is why the
 * `KeyboardAvoidingView` wraps only the sheet. Putting the whole screen inside one would push
 * the wordmark off the top on a small device the moment a text field focused.
 */
export function AuthScaffold({ topLink, children }: AuthScaffoldProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const headerHeight = Math.round(height * AUTH_HEADER_HEIGHT_RATIO);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          {
            height: headerHeight,
            paddingTop: insets.top + tokens.spacing.md,
            paddingLeft: insets.left + tokens.spacing.lg,
            paddingRight: insets.right + tokens.spacing.lg,
          },
        ]}
      >
        {/* Reserved whether or not `topLink` is given, so the wordmark sits at the same height
            on every screen — the header must not visibly shift between, say, the phone screen
            and the OTP screen that follows it. */}
        {/* The auth header is a flat `brand` fill behind the bar, not a gradient. */}
        <GroundStatusBar topColor={markGround.header.backgroundColor} />
        <View style={styles.topRow}>{topLink}</View>
        <View style={styles.brandRow}>
          <BrandMark size={BRAND_MARK_SIZE} tone="solid" groundColor={markGround.header.backgroundColor} />
          <Text variant="title" tone="inverse">
            BlueSmoke
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={[
            styles.sheetContent,
            {
              paddingLeft: insets.left + tokens.spacing.lg,
              paddingRight: insets.right + tokens.spacing.lg,
              paddingBottom: insets.bottom + tokens.spacing.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.body}>{children}</View>
          <Pressable
            onPress={() => {
              Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
                // A device with no mail client rejects the URL. There is nothing useful to say
                // about that beyond the address itself, which is already on screen and
                // selectable — so swallow it rather than show an error about an error.
              });
            }}
            accessibilityRole="link"
            accessibilityLabel={`Contact support at ${SUPPORT_EMAIL}`}
            style={styles.support}
          >
            <Text variant="caption" tone="secondary">
              Need help? Contact {SUPPORT_EMAIL}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Header height as a fraction of screen height, so the sheet's curved top edge lands at the same
 * height as Home's curtain card (`HomeScreen.tsx`'s `DEVICES_CURTAIN_TOP_RATIO`) rather than
 * wherever the header's own content happens to end. Kept equal to that constant (design ask,
 * 2026-08-31, when Home's card grew from 0.31 to 0.28) rather than left at the old value — the
 * whole point of sharing this number is that the two curved cards read as the same height.
 */
const AUTH_HEADER_HEIGHT_RATIO = 0.28;

/** Matched to the wordmark's cap height so the two read as one lockup, not an icon and a label. */
const BRAND_MARK_SIZE = 28;

/**
 * The mark's inner flame is a knockout, so it has to be filled with whatever the mark sits on —
 * here, the header's own brand ground. Routed through a `StyleSheet` object and read back out
 * rather than passed as the brand token directly, so `contrastCompleteness`'s
 * scanner sees a `backgroundColor:` it can classify: `groundColor` is only treated as a
 * decorative shape key inside `BrandMark.tsx` and `illustrations/`, deliberately, so that a real
 * icon elsewhere can't slip past its contrast obligation. Same trick as `Button`'s
 * `spinnerColor`.
 */
const markGround = StyleSheet.create({
  header: { backgroundColor: tokens.color.brand },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.brand,
  },
  header: {
    paddingBottom: tokens.spacing.xl,
    backgroundColor: tokens.color.brand,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: tokens.touchTarget.minHeight,
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.md,
  },
  sheetWrap: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: tokens.color.backgroundMuted,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
  },
  sheetContent: {
    // `flexGrow`, not `flex`, so the sheet fills the screen when the form is short but still
    // scrolls once the keyboard squeezes it — the support line must stay reachable either way.
    flexGrow: 1,
    paddingTop: tokens.spacing.xl,
  },
  body: {
    flex: 1,
  },
  support: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xl,
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
  },
});
