/**
 * Every spec must render. A gallery whose entries crash is worse than no gallery — the whole
 * point is to walk all 62 surfaces, and a broken one is discovered mid-review.
 *
 * Cheaper and more complete than tapping through the simulator: this covers all 62 entries and
 * every layout archetype on each run.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScreenPreviewScreen } from '../ScreenPreviewScreen';
import { ScreenGalleryScreen } from '../ScreenGalleryScreen';
import { SCREEN_SPECS, SECTIONS, specById, type Layout } from '../screenSpecs';
import { REAL_PREVIEWS } from '../realPreviews';

const Stack = createNativeStackNavigator();

function renderPreview(id: string): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="ScreenPreview" component={ScreenPreviewScreen} initialParams={{ id }} />
        </Stack.Navigator>
      </NavigationContainer>,
    );
  });
  return renderer;
}

function text(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe('screen gallery specs', () => {
  it('covers a non-empty set', () => {
    expect(SCREEN_SPECS.length).toBeGreaterThan(40);
  });

  it('has no duplicate ids — ids are the design-reference key, collisions would be silent', () => {
    const ids = SCREEN_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every spec belongs to a declared section', () => {
    const known = new Set(SECTIONS.map((s) => s.id));
    for (const spec of SCREEN_SPECS) {
      expect(known.has(spec.section)).toBe(true);
    }
  });

  it('every cta `to` target resolves to a real screen', () => {
    for (const spec of SCREEN_SPECS) {
      for (const cta of spec.ctas ?? []) {
        if (cta.to !== undefined) {
          expect(specById(cta.to)).toBeDefined();
        }
      }
    }
  });

  it('renders the gallery index', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="ScreenGallery" component={ScreenGalleryScreen} />
          </Stack.Navigator>
        </NavigationContainer>,
      );
    });
    const out = text(renderer);
    // P2-6.0 (UI-BUILD-B) shipped VF-1, ON-5, VF-2..VF-7, and VF-12 as real screens — their
    // gallery placeholders were removed, dropping the total from 62 to 53. P1-2.0 shipped
    // ON-1..3 the same way (real, walkable via the pre-auth flow) — 53 to 50. ON-4/6/7/8/9 are
    // also real now but keep their entries (see `realPreviews.tsx`), so they don't move the count.
    expect(out).toContain('50 screens');
    expect(out).toContain('Boot splash');
    expect(out).toContain('Locked');
  });
});

describe('every spec renders', () => {
  it.each(SCREEN_SPECS.map((s) => [s.id, s.name] as const))('%s %s', (id) => {
    const renderer = renderPreview(id);
    const out = text(renderer);
    const spec = specById(id);

    if (REAL_PREVIEWS[id]) {
      // Real component, not the generic placeholder (`realPreviews.tsx`) — it carries no
      // metadata footer to assert on; the CTA-press tests under `onboarding/__tests__/` are
      // what actually cover these. This test's only job for them is "does it crash."
      return;
    }

    // The metadata footer always identifies the exhibit.
    expect(out).toContain(id);

    // Title copy reaches the screen, except SH-1 which deliberately has none.
    if (spec?.title !== undefined && spec.title !== '') {
      expect(out).toContain(spec.title.slice(0, 12));
    }
  });
});

describe('layout coverage', () => {
  const used = new Set<Layout>(SCREEN_SPECS.map((s) => s.layout));

  // 'carousel' dropped from this list in P1-2.0: ON-1..3 were its only specs, and they're now
  // real, walkable screens rather than gallery placeholders — there is no longer a placeholder
  // carousel for this suite to demonstrate, which is the intended end state, not a gap.
  it.each(['message', 'form', 'list', 'status', 'loading', 'notification'] as const)(
    'the %s archetype is exercised by at least one spec',
    (layout) => {
      expect(used.has(layout)).toBe(true);
    },
  );
});
