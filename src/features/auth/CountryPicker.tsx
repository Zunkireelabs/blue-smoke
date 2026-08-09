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
}

export function CountryPicker({ value, onChange }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

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
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Country code"
      >
        <Text variant="body">{countryLabel(value)}</Text>
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
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <ListRow
                label={countryLabel(item)}
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
