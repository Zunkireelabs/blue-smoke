import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { specById, type Cta, type ScreenSpec } from './screenSpecs';
import { REAL_PREVIEWS } from './realPreviews';

/**
 * Dev-only. Renders one `ScreenSpec` as a rough placeholder screen — or, for the handful of ids
 * in `REAL_PREVIEWS`, the actual shipped component (see that file's header comment for why some
 * built screens still need a gallery entry).
 *
 * ONE renderer for all 62 screens rather than 62 hand-written components. That is a deliberate
 * trade: hand-writing them would take a day and produce throwaway code that still is not a
 * design. This gets the whole surface walkable now, which is what unblocks the design pass.
 *
 * What it is honest about: layout archetype, copy, and the CTA set. What it does NOT claim to
 * be: a design. Every screen here is deliberately plain so nothing reads as a proposal.
 */
export function ScreenPreviewScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ScreenPreview'>>();
  const RealPreview = REAL_PREVIEWS[route.params.id];
  if (RealPreview) {
    return <RealPreview />;
  }

  const spec = specById(route.params.id);

  if (!spec) {
    return (
      <View style={styles.fallback}>
        <Text variant="body">Unknown screen id: {route.params.id}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <PreviewBody spec={spec} />
      </ScrollView>
      <SpecFooter spec={spec} />
    </View>
  );
}

function PreviewBody({ spec }: { spec: ScreenSpec }) {
  switch (spec.layout) {
    case 'loading':
      return (
        <View style={styles.centred}>
          <ActivityIndicator color={tokens.color.textPrimary} />
          {spec.title !== '' && (
            <Text variant="title" style={styles.centredText}>
              {spec.title}
            </Text>
          )}
          {spec.body !== undefined && (
            <Text variant="body" tone="secondary" style={styles.centredText}>
              {spec.body}
            </Text>
          )}
          <CtaGroup ctas={spec.ctas} />
        </View>
      );

    case 'form':
      return (
        <View style={styles.stack}>
          <Text variant="title">{spec.title}</Text>
          {spec.body !== undefined && (
            <Text variant="body" tone="secondary">
              {spec.body}
            </Text>
          )}
          {spec.fields?.map((f) => (
            <TextField key={f} label={f} placeholder={f} editable={false} />
          ))}
          <CtaGroup ctas={spec.ctas} />
        </View>
      );

    case 'list':
      return (
        <View style={styles.stack}>
          <Text variant="title">{spec.title}</Text>
          <View style={styles.list}>
            {spec.rows?.map((r) => (
              <View key={r} style={styles.listRow}>
                <Text variant="body">{r}</Text>
              </View>
            ))}
          </View>
          <CtaGroup ctas={spec.ctas} />
        </View>
      );

    case 'status':
      return (
        <View style={styles.centred}>
          <Card style={styles.statusCard}>
            <Text variant="title" style={styles.centredText}>
              {spec.title}
            </Text>
            {spec.body !== undefined && (
              <Text variant="body" tone="secondary" style={styles.centredText}>
                {spec.body}
              </Text>
            )}
          </Card>
          <CtaGroup ctas={spec.ctas} />
        </View>
      );

    case 'carousel':
      return (
        <View style={styles.centred}>
          <Card style={styles.statusCard}>
            <Text variant="title" style={styles.centredText}>
              {spec.title}
            </Text>
            {spec.body !== undefined && (
              <Text variant="body" tone="secondary" style={styles.centredText}>
                {spec.body}
              </Text>
            )}
          </Card>
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotOn]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <CtaGroup ctas={spec.ctas} />
        </View>
      );

    case 'notification':
      return (
        <View style={styles.stack}>
          <Text variant="label" tone="secondary">
            Renders outside the app frame
          </Text>
          <Card style={styles.notif}>
            <Text variant="label">BlueSmoke</Text>
            <Text variant="body">{spec.title}</Text>
            {spec.body !== undefined && (
              <Text variant="caption" tone="secondary">
                {spec.body}
              </Text>
            )}
          </Card>
        </View>
      );

    case 'message':
    default:
      return (
        <View style={styles.centred}>
          <Text variant="title" style={styles.centredText}>
            {spec.title}
          </Text>
          {spec.body !== undefined && (
            <Text variant="body" tone="secondary" style={styles.centredText}>
              {spec.body}
            </Text>
          )}
          <CtaGroup ctas={spec.ctas} />
        </View>
      );
  }
}

/**
 * The kit has one button variant (primary). Secondary and destructive are known gaps, so they
 * are approximated here rather than added to `src/shared/ui` — that is a real design decision
 * and a contested shared file, not something a dev gallery should settle.
 */
function CtaGroup({ ctas }: { ctas?: ReadonlyArray<Cta> }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (ctas === undefined || ctas.length === 0) {
    return (
      <Text variant="caption" tone="secondary" style={styles.noCta}>
        No controls on this screen
      </Text>
    );
  }

  return (
    <View style={styles.ctas}>
      {ctas.map((cta) =>
        cta.kind === 'primary' || cta.kind === undefined ? (
          <Button
            key={cta.label}
            label={cta.label}
            onPress={() => {
              if (cta.to !== undefined) {
                navigation.push('ScreenPreview', { id: cta.to });
              }
            }}
          />
        ) : (
          <Pressable
            key={cta.label}
            accessibilityRole="button"
            accessibilityLabel={cta.label}
            style={styles.secondary}
            onPress={() => {
              if (cta.to !== undefined) {
                navigation.push('ScreenPreview', { id: cta.to });
              }
            }}
          >
            <Text variant="label" tone={cta.kind === 'destructive' ? 'danger' : 'link'}>
              {cta.label}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** Metadata strip. Never part of the screen being previewed — it is the label on the exhibit. */
function SpecFooter({ spec }: { spec: ScreenSpec }) {
  return (
    <View style={styles.footer}>
      <View style={styles.footerTop}>
        <Text variant="caption" tone="secondary">
          {spec.id} · {spec.name}
        </Text>
        <Text variant="caption" tone="secondary">
          {spec.node ?? '—'} · {spec.status.toUpperCase()}
        </Text>
      </View>
      {spec.note !== undefined && (
        <Text variant="caption" tone="secondary" style={styles.footerNote}>
          {spec.note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.background },
  body: { flexGrow: 1, padding: tokens.spacing.xl, justifyContent: 'center' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stack: { gap: tokens.spacing.lg },
  centred: { gap: tokens.spacing.lg, alignItems: 'stretch' },
  centredText: { textAlign: 'center' },
  statusCard: { gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xxl },
  list: { borderTopWidth: 1, borderTopColor: tokens.color.border },
  listRow: {
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  notif: { gap: tokens.spacing.xs, backgroundColor: tokens.color.backgroundMuted },
  dots: { flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.border,
  },
  dotOn: { backgroundColor: tokens.color.textPrimary },
  ctas: { gap: tokens.spacing.md, marginTop: tokens.spacing.sm },
  secondary: {
    minHeight: tokens.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCta: { textAlign: 'center', marginTop: tokens.spacing.lg },
  footer: {
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.backgroundMuted,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  footerTop: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing.sm },
  footerNote: { lineHeight: 16 },
});
