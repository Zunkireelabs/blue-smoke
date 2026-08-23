import { useCallback, useRef, useState, type ComponentType } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  BrandGround,
  Button,
  FlameIllustration,
  PageDots,
  PrivacyIllustration,
  ProximityIllustration,
  ScreenScaffold,
  Text,
  tokens,
  useScaffoldContentWidth,
} from '@/shared/ui';
import { completeOnboarding } from '@/app/stores/useOnboardingStore';

interface Card {
  title: string;
  body: string;
  Illustration: ComponentType<{ size: number }>;
}

const ILLUSTRATION_SIZE = 140;

const CARDS: readonly Card[] = [
  {
    // ON-1 / F1.1
    title: 'Welcome to BlueSmoke',
    body: "Your device, locked unless you're nearby.",
    Illustration: FlameIllustration,
  },
  {
    // ON-2 / F1.2. Must not imply the APP does the locking — the firmware dead-man timer does,
    // and the device locks itself whether or not BlueSmoke is even running (CLAUDE.md rule).
    title: 'It locks itself',
    body: 'When your phone moves out of range, your device locks on its own — even if BlueSmoke is closed.',
    Illustration: ProximityIllustration,
  },
  {
    // ON-3 / F1.3. The product's core privacy promise. Deliberately does not claim an age was
    // "verified as 18+" — `min_age` (CLAUDE.md, TECHNICAL_SPEC.md:1031) means no code here can
    // confirm that's what the partner's template actually checks. Mirrors VF-1's "yes or no"
    // phrasing rather than inventing a stronger claim.
    title: 'What we hold',
    body: 'We never see or store your ID or your selfie — ever. Our verification partner checks them and tells us one thing: yes or no.',
    Illustration: PrivacyIllustration,
  },
];

/**
 * ON-1..3 (F1.1-F1.3, `SCREEN_MAP.md`) — the three-card onboarding carousel. First launch,
 * before any account exists, so navigating "out" of this screen is not a `navigate()` call to
 * an auth route: it flips `useOnboardingStore`'s status via `completeOnboarding()`, and
 * `RootNavigator` swaps the whole mounted stack from `onboarding` to `auth` in response — the
 * same external-state-driven transition `SignOutButton` uses for the reverse direction.
 *
 * A single component with internal card state, not three routes: three cards is not "the
 * carousel", it's one screen with three faces, and there's nowhere the carousel need be
 * resumed mid-way (`USER_FLOWS.md`: "shown once").
 *
 * Restyled for UI-BUILD-E part 3: `ScreenScaffold` lays out the current card's illustration
 * (header slot) over a swipeable `ScrollView` of the three cards' text (middle slot), with
 * `PageDots` + the CTAs pinned to the bottom (actions slot). Buttons and the swipe gesture both
 * drive the same `index` state, via `goTo`/`onMomentumScrollEnd`, so the dots and the visible
 * card can never disagree.
 */
export function OnboardingCarouselScreen() {
  const [index, setIndex] = useState(0);
  const Illustration = CARDS[index].Illustration;
  const scrollRef = useRef<ScrollView>(null);
  const pageWidth = useScaffoldContentWidth();
  const isLast = index === CARDS.length - 1;

  const finish = () => {
    completeOnboarding().catch(() => {});
  };

  const goTo = useCallback(
    (next: number) => {
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * pageWidth, animated: true });
    },
    [pageWidth],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      setIndex(Math.max(0, Math.min(CARDS.length - 1, next)));
    },
    [pageWidth],
  );

  return (
    <BrandGround style={styles.noGroundPadding}>
      <ScreenScaffold
        header={<Illustration size={ILLUSTRATION_SIZE} />}
        body={
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            style={styles.pager}
          >
            {CARDS.map((c, i) => (
              <View key={i} style={[styles.page, { width: pageWidth }]}>
                <Text variant="title" tone="inverse" style={styles.title}>
                  {c.title}
                </Text>
                <Text variant="body" tone="inverse" style={styles.body}>
                  {c.body}
                </Text>
              </View>
            ))}
          </ScrollView>
        }
        actions={
          <View style={styles.actions}>
            <PageDots count={CARDS.length} activeIndex={index} />
            {isLast ? (
              <Button label="Get started" shape="pill" variant="onBrand" onPress={finish} />
            ) : (
              <Button label="Continue" shape="pill" variant="onBrand" onPress={() => goTo(index + 1)} />
            )}
            {/* Only card 2 offers Skip, matching the shipped copy deck (`screenSpecs.ts` ON-2) —
                card 1 has nothing to skip past yet, and card 3's own CTA already exits the carousel. */}
            {index === 1 && <Button label="Skip" shape="pill" variant="textLink" onPress={finish} />}
          </View>
        }
      />
    </BrandGround>
  );
}

const styles = StyleSheet.create({
  // `ScreenScaffold` owns safe-area + content padding for this screen; `BrandGround`'s own inset
  // padding is zeroed here so the two don't stack (BrandGround still supplies the full-bleed
  // brand background behind the status bar).
  noGroundPadding: {
    padding: 0,
  },
  // Bounds the horizontal ScrollView to its parent's width — without this it sizes to its
  // content (all three pages laid end to end) and the next card's text bleeds past the screen
  // edge instead of being clipped by the scroll viewport.
  pager: {
    flex: 1,
  },
  page: {
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: tokens.spacing.lg,
  },
  body: {
    textAlign: 'center',
  },
  actions: {
    gap: tokens.spacing.md,
  },
});
