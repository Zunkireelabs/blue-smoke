import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { SCREEN_SPECS, SECTIONS, specsForSection, type ScreenStatus } from './screenSpecs';

/**
 * Dev-only index of every screen in `docs/system-design-ux/SCREEN_MAP.md`.
 *
 * Exists because most of the app cannot be reached by using it: `LK-4` needs hardware and
 * OQ-12, `VF-8` needs a real decline, `ON-8` needs a permanently-denied permission. Walking
 * the surface to brief a designer is impossible without a way to jump straight to a screen.
 *
 * 🔴 Mounted behind `__DEV__`. Never reachable in a release build.
 */
export function ScreenGalleryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const built = SCREEN_SPECS.filter((s) => s.status === 'built').length;
  const partial = SCREEN_SPECS.filter((s) => s.status === 'partial' || s.status === 'stub').length;
  const blocked = SCREEN_SPECS.filter((s) => s.status === 'blocked').length;
  const absent = SCREEN_SPECS.filter((s) => s.status === 'absent').length;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text variant="caption" tone="secondary">
        {`${SCREEN_SPECS.length} screens · ${built} built · ${partial} partial · ${blocked} blocked · ${absent} absent`}
      </Text>
      <Text variant="caption" tone="secondary" style={styles.lede}>
        Placeholders, not designs. Quote the screen ID to attach a reference.
      </Text>

      {SECTIONS.map((section) => (
        <Fragment key={section.id}>
          <View style={styles.sectionHead}>
            <Text variant="label">{`${section.id} · ${section.name}`}</Text>
            <Text variant="caption" tone="secondary">
              {section.blurb}
            </Text>
          </View>

          {specsForSection(section.id).map((spec) => (
            <Pressable
              key={spec.id}
              accessibilityRole="button"
              accessibilityLabel={`${spec.id} ${spec.name}`}
              style={styles.row}
              onPress={() => navigation.navigate('ScreenPreview', { id: spec.id })}
            >
              <View style={styles.rowMain}>
                <Text variant="caption" tone="secondary">
                  {spec.id}
                </Text>
                <Text variant="body">{spec.name}</Text>
              </View>
              <StatusTag status={spec.status} />
            </Pressable>
          ))}
        </Fragment>
      ))}
    </ScrollView>
  );
}

/**
 * Status as a text tag rather than a colour chip: the kit has no Badge primitive, and the
 * palette is a provisional placeholder pending OQ-7, so inventing status colours here would be
 * a brand decision smuggled in through dev tooling.
 */
function StatusTag({ status }: { status: ScreenStatus }) {
  const tone = status === 'blocked' ? 'danger' : 'secondary';
  return (
    <Text variant="caption" tone={tone}>
      {status.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  lede: { marginTop: tokens.spacing.xs },
  sectionHead: {
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.xs,
    gap: tokens.spacing.xs,
  },
  row: {
    minHeight: tokens.touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  rowMain: { flexShrink: 1, gap: 2 },
});
