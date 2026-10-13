import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { EmptyState, ErrorNotice, LoadingState, StatusBadge } from '@/components/feedback';
import { IconTile } from '@/components/IconTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UiIcon } from '@/components/UiIcon';
import { getAllEvents, type CloudEvent } from '@/lib/events';
import { useAuth, useRole } from '@/lib/auth';

// Editorial Mono V2: black check-in ledger card + numbered event rows.
export default function EventsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { role } = useRole();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEvents(await getAllEvents());
    } catch {
      setError('Could not load events. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState message="Loading events…" />;
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader index="01" eyebrow="SCHOOL EVENTS" title="Available events" />
        <ErrorNotice message={error} onRetry={() => void load()} />
      </View>
    );
  }

  const openCount = events.filter((e) => e.status === 'open').length;

  return (
    <View style={styles.container}>
      <ScreenHeader
        index="01"
        eyebrow="SCHOOL EVENTS"
        title="Available events"
        subtitle={
          role === 'teacher' || role === 'admin'
            ? 'Manage events in the Event tab. Students scan the QR to check in.'
            : 'Open an event, then scan its QR code to record attendance.'
        }
      />

      {/* Ledger hero: live count + scan action in solid black */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan QR to check in now"
        onPress={() => router.push('/(tabs)/scan')}
        style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
      >
        <View style={styles.heroTop}>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {openCount > 0 ? `${String(openCount).padStart(2, '0')} OPEN NOW` : 'NO OPEN EVENTS'}
            </Text>
          </View>
          <Text style={styles.heroIndex}>QR—01</Text>
        </View>
        <Text style={styles.heroTitle}>Ready to check in?</Text>
        <Text style={styles.heroSub}>
          {openCount > 0 ? 'Point at the event QR to record attendance.' : 'Ask a teacher for the event QR.'}
        </Text>
        <View style={styles.heroAction}>
          <Text style={styles.heroActionText}>Scan QR</Text>
          <View style={styles.heroArrow}>
            <UiIcon name="chevron-right" size={16} color={COLORS.primary} />
          </View>
        </View>
      </Pressable>

      <View style={styles.listHead}>
        <Text style={styles.listHeadText}>ALL EVENTS — {String(events.length).padStart(2, '0')}</Text>
        <View style={styles.listRule} />
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={events.length === 0 ? styles.emptyList : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.status}`}
            onPress={() => router.push('/(tabs)/scan')}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.titleBlock}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.cardCode}>{item.event_code}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>
            <View style={styles.metaRow}>
              <IconTile name="calendar" tone={item.status === 'open' ? 'primary' : 'neutral'} size={36} iconSize={16} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.start_time ? new Date(item.start_time).toLocaleString() : 'No start set'}
                {item.venue ? `  ·  ${item.venue}` : ''}
              </Text>
            </View>
            {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
            <View style={styles.ctaRow}>
              <Text style={[styles.cardCta, item.status !== 'open' && styles.cardCtaMuted]}>
                {item.status === 'open' ? 'Scan QR to check in' : 'Closed — check-in disabled'}
              </Text>
              {item.status === 'open' ? <UiIcon name="chevron-right" size={15} color={COLORS.primary} /> : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No events yet"
            hint={user ? 'Ask a teacher to create one. Pull down to refresh.' : 'Sign in to view events.'}
            art="no-results"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20, paddingTop: 24 },
  list: { gap: 12, paddingBottom: 28 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    backgroundColor: COLORS.primaryDeep,
    borderRadius: RADIUS.xl,
    padding: 20,
    marginBottom: 20,
    gap: 8,
    ...SHADOW.pop,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  liveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, fontFamily: 'monospace' },
  heroIndex: { color: '#FFFFFF66', fontSize: 11, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  heroSub: { color: '#D6D3D1', fontSize: 13, fontWeight: '500', lineHeight: 19 },
  heroAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: RADIUS.pill, paddingLeft: 18, paddingRight: 6, paddingVertical: 6 },
  heroActionText: { color: COLORS.primary, fontSize: 14, fontWeight: '800' },
  heroArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  listHeadText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, fontFamily: 'monospace' },
  listRule: { flex: 1, height: 1, backgroundColor: COLORS.border },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOW.card,
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIndex: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', fontFamily: 'monospace', paddingTop: 3 },
  titleBlock: { flex: 1, gap: 4 },
  cardTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', lineHeight: 21, letterSpacing: -0.2 },
  cardCode: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, fontFamily: 'monospace', backgroundColor: COLORS.surface, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', flexShrink: 1, flex: 1 },
  cardDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    minHeight: 24,
  },
  cardCta: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800' },
  cardCtaMuted: { color: COLORS.textSecondary, fontWeight: '600' },
});
