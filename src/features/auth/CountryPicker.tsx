import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';

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
        <Text style={styles.triggerText}>{countryLabel(value)}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalContainer}>
          <TextInput
            style={styles.search}
            placeholder="Search country"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            accessibilityLabel="Search country"
          />
          <FlatList
            data={filtered}
            keyExtractor={code => code}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery('');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.rowText}>{countryLabel(item)}</Text>
              </Pressable>
            )}
          />
          <Pressable
            style={styles.close}
            onPress={() => {
              setOpen(false);
              setQuery('');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerText: {
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  search: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rowText: {
    fontSize: 16,
  },
  close: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
