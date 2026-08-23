import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';
import { completeOnboarding } from '@/app/stores/useOnboardingStore';

interface Card {
  title: string;
  body: string;
}

const CARDS: readonly Card[] = [
  {
    // ON-1 / F1.1
    title: 'Welcome to BlueSmoke',
    body: "Your device, locked unless you're nearby.",
  },
  {
    // ON-2 / F1.2. Must not imply the APP does the locking — the firmware dead-man timer does,
    // and the device locks itself whether or not BlueSmoke is even running (CLAUDE.md rule).
    title: 'It locks itself',
    body: 'When your phone moves out of range, your device locks on its own — even if BlueSmoke is closed.',
  },
  {
    // ON-3 / F1.3. The product's core privacy promise. Deliberately does not claim an age was
    // "verified as 18+" — `min_age` (CLAUDE.md, TECHNICAL_SPEC.md:1031) means no code here can
    // confirm that's what the partner's template actually checks. Mirrors VF-1's "yes or no"
    // phrasing rather than inventing a stronger claim.
    title: 'What we hold',
    body: 'We never see or store your ID or your selfie — ever. Our verification partner checks them and tells us one thing: yes or no.',
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
 */
export function OnboardingCarouselScreen() {
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const isLast = index === CARDS.length - 1;

  const finish = () => {
    completeOnboarding().catch(() => {});
  };

  return (
    <GradientGround style={styles.sheet}>
      <Text variant="caption" tone="secondary" style={styles.progress}>
        {`${index + 1} of ${CARDS.length}`}
      </Text>
      <Text variant="title" style={styles.title}>
        {card.title}
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        {card.body}
      </Text>

      <View style={styles.actions}>
        {isLast ? (
          <Button label="Get started" onPress={finish} />
        ) : (
          <Button label="Continue" onPress={() => setIndex((i) => i + 1)} />
        )}
        {/* Only card 2 offers Skip, matching the shipped copy deck (`screenSpecs.ts` ON-2) —
            card 1 has nothing to skip past yet, and card 3's own CTA already exits the carousel. */}
        {index === 1 && (
          <Button label="Skip" variant="secondary" onPress={finish} />
        )}
      </View>
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  sheet: {
    justifyContent: 'center',
  },
  progress: {
    textAlign: 'center',
    marginBottom: tokens.spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: tokens.spacing.lg,
  },
  body: {
    textAlign: 'center',
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
});
