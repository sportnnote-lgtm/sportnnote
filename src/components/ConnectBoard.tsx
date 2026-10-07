/** The Connect noticeboard, embedded inside Discover. Renders plain Views (no
 *  own scroll container) so it sits in Discover's ScrollView. Players post that
 *  they want a team, teams post for players/opponents/grounds; anyone interested
 *  reaches out via the shared contact or a one-tap WhatsApp message. */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Pill, Button, EmptyState, textStyles } from './ui';
import { getSport } from '../sports/registry';
import { useListings } from '../data/hooks';
import { PlayerFilters, activeFilterCount, type PlayerFilterState } from './PlayerFilters';
import { useAuth } from '../core/auth';
import { getMyPlayerId, deleteListing } from '../data/repos';
import { LISTING_KINDS, kindMeta, openWhatsApp, timeAgo } from '../core/connect';
import type { Listing, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ConnectBoard() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  // Same "⚙ Filters" panel as People: post type, sports, city. The board is small,
  // so we load every post and filter on the device.
  const [filters, setFilters] = useState<PlayerFilterState>({});
  const { listings: all, reload } = useListings();
  const cities = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const l of all) {
      const t = (l.city ?? '').trim();
      if (!t) continue;
      const k = t.toLowerCase();
      counts.set(k, { label: counts.get(k)?.label ?? t, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((c) => c.label);
  }, [all]);
  const listings = all.filter((l) =>
    (!filters.types?.length || filters.types.includes(l.kind))
    && (!filters.sports?.length || filters.sports.includes(l.sport as SportId))
    && (!filters.cities?.length || filters.cities.some((c) => c.toLowerCase() === (l.city ?? '').trim().toLowerCase())));
  const typeOptions = LISTING_KINDS.map((k) => ({ id: k.kind as string, label: `${k.icon} ${k.short}` }));

  const [myId, setMyId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
      return () => {
        on = false;
      };
    }, [profile?.id])
  );

  const now = Date.now();

  const remove = async (id: string) => {
    await deleteListing(id);
    reload();
  };

  const reachOut = (l: Listing) => {
    const who = l.teamName ?? l.authorName;
    openWhatsApp(l.contactPhone, `Hi ${who}, I saw your SportnNote post (${kindMeta(l.kind).short}) and I'm interested.`);
  };

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Button label="✏️ Post a listing" onPress={() => nav.navigate('CreateListing')} />

      <PlayerFilters value={filters} onChange={setFilters} cities={cities} sections={['types', 'sports', 'cities']} typeOptions={typeOptions} typeLabel="Post type" />

      {listings.length === 0 && (
        <EmptyState icon="📣" title={activeFilterCount(filters) ? 'No posts match' : 'No posts here yet'} hint={activeFilterCount(filters) ? 'Try removing a filter — or post one yourself.' : 'Be the first — tap “Post a listing”.'} compact />
      )}

      {listings.map((l) => {
        const meta = kindMeta(l.kind);
        const title = l.teamName ?? l.authorName;
        const mine = !!myId && l.authorId === myId;
        const tags = [l.preferredDate ? `📅 ${l.preferredDate}` : null, l.level ? `🏁 ${l.level}` : null].filter(Boolean) as string[];
        return (
          <Card key={l.id} style={st.card}>
            <View style={st.cardHead}>
              <Pill label={`${meta.icon} ${meta.short}`} color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
              <Text style={st.sportIcon}>{getSport(l.sport).icon}</Text>
              <View style={{ flex: 1 }} />
              <Text style={textStyles.muted}>{timeAgo(l.createdAt, now)}</Text>
            </View>

            <Text style={textStyles.h3} numberOfLines={1}>{title}</Text>
            <Text style={textStyles.muted} numberOfLines={1}>
              {getSport(l.sport).name}
              {l.position ? ` · ${l.position}` : ''}
              {l.city ? ` · 📍 ${l.city}` : ''}
            </Text>
            {tags.length > 0 && (
              <View style={st.tags}>
                {tags.map((t) => (
                  <Pill key={t} label={t} />
                ))}
              </View>
            )}
            {l.details ? <Text style={st.details}>{l.details}</Text> : null}

            <View style={st.actions}>
              {l.contactPhone ? (
                <TouchableOpacity accessibilityRole="button" style={st.waBtn} activeOpacity={0.85} onPress={() => reachOut(l)}>
                  <Text style={st.waText}>💬 WhatsApp</Text>
                </TouchableOpacity>
              ) : (
                <Text style={textStyles.muted}>No contact shared</Text>
              )}
              {l.contactPhone ? (
                <View style={st.contactCol}>
                  <Text style={st.phone}>{l.contactPhone}</Text>
                  {l.contactVerified ? (
                    <Text style={st.verified}>✓ Verified contact</Text>
                  ) : (
                    <Text style={st.unverified}>⚠︎ Unverified</Text>
                  )}
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              {mine && <Text style={st.remove} onPress={() => remove(l.id)}>Remove</Text>}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  card: { gap: theme.spacing(2) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  sportIcon: { fontSize: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  details: { color: theme.colors.text, fontSize: theme.font.small, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  waBtn: { backgroundColor: '#25D366', borderRadius: theme.radius.pill, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3) },
  waText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '800' },
  contactCol: { gap: 1 },
  phone: { color: theme.colors.textMuted, fontSize: theme.font.small },
  verified: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '700' },
  unverified: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
});
