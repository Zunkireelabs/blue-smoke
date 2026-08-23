import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import { Button, ListRow, Text, TextField, tokens } from '@/shared/ui';

/**
 * P1-1.0 §3.3 — country-code picker for the phone input screen. No
 * `@react-native-picker/picker` dependency (another package.json change to
 * announce, for a component this simple to build directly) — a Modal +
 * FlatList + search box, the standard RN pattern for this.
 *
 * Country display names use `Intl.DisplayNames`, guarded: Hermes support
 * varies by RN/engine version and this can't be verified on a device from
 * this machine (brief §2). Falls back to the raw ISO code (e.g. "US")
 * where unsupported — not invented, an honest degraded display.
 */

let cachedDisplayNames: Intl.DisplayNames | null | undefined;
function getDisplayNames(): Intl.DisplayNames | null {
  if (cachedDisplayNames === undefined) {
    try {
      cachedDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      cachedDisplayNames = null;
    }
  }
  return cachedDisplayNames;
}

function countryLabel(code: CountryCode): string {
  const name = getDisplayNames()?.of(code) ?? code;
  return `${name} (+${getCountryCallingCode(code)})`;
}

const ALL_COUNTRIES: CountryCode[] = getCountries();

interface CountryPickerProps {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
  /**
   * `'full'` (default, unchanged) — "United States (+1)" in a full-width bordered row, as the
   * pre-restyle screen used it. `'compact'` — just "+1 ⌄" in a chip sized to sit beside the
   * phone field, which is what the reference design puts there. Additive: `'full'` keeps every
   * existing call site rendering exactly as before.
   */
  variant?: 'full' | 'compact';
}

/**
 * Hoisted to module scope rather than defined inline in `renderItem` —
 * `react/no-unstable-nested-components` flags a component defined during
 * render because React would see a new component type on every render.
 */
function CountryRow({ code, onPress }: { code: CountryCode; onPress: () => void }) {
  return <ListRow label={countryLabel(code)} onPress={onPress} />;
}

/** Same hoisting reason as `CountryRow` — `FlatList`'s `ItemSeparatorComponent` expects a
 * stable component reference, not one redefined on every render. */
function RowSeparator() {
  return <View style={styles.separator} />;
}

export function CountryPicker({ value, onChange, variant = 'full' }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const compact = variant === 'compact';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return ALL_COUNTRIES;
    }
    return ALL_COUNTRIES.filter(
      code =>
        countryLabel(code).toLowerCase().includes(q) ||
        code.toLowerCase().includes(q) ||
        getCountryCallingCode(code).includes(q),
    );
  }, [query]);

  return (
    <>
      <Pressable
        style={compact ? styles.triggerCompact : styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        // The visible label shrinks to "+1" in the compact chip; the accessible name must not,
        // or a screen-reader user hears a bare number with no indication of what it selects.
        accessibilityLabel={`Country code, ${countryLabel(value)}`}
      >
        <Text variant="body">{compact ? `+${getCountryCallingCode(value)}` : countryLabel(value)}</Text>
        {/* A glyph, not an SVG icon: `contrastCompleteness`'s guard deliberately refuses to
            treat `fill`/`stroke` as decorative outside BrandMark and illustrations/, so a drawn
            caret here would need a new contrast classification for what is, visually, a piece of
            text. Rendering it as text is also what the rest of the kit already does. */}
        {compact && (
          <Text variant="body" tone="secondary" accessibilityElementsHidden>
            ▾
          </Text>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalContainer}>
          <TextField
            placeholder="Search country"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            accessibilityLabel="Search country"
          />
          <FlatList
            style={styles.list}
            data={filtered}
            keyExtractor={code => code}
            ItemSeparatorComponent={RowSeparator}
            renderItem={({ item }) => (
              <CountryRow
                code={item}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery('');
                }}
              />
            )}
          />
          <View style={styles.close}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setOpen(false);
                setQuery('');
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: tokens.touchTarget.minHeight,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radii.md,
    paddingHorizontal: tokens.spacing.md,
    justifyContent: 'center',
  },
  triggerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: tokens.touchTarget.minHeight,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.lg,
    paddingHorizontal: tokens.spacing.md,
    justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
    paddingTop: tokens.spacing.xxl * 2,
    paddingHorizontal: tokens.spacing.lg,
    backgroundColor: tokens.color.background,
  },
  list: {
    marginTop: tokens.spacing.md,
  },
  separator: {
    height: tokens.spacing.xs,
  },
  close: {
    paddingVertical: tokens.spacing.md,
  },
});
