/** The Connect noticeboard, embedded inside Discover. Renders plain Views (no
 *  own scroll container) so it sits in Discover's ScrollView. Players post that
 *  they want a team, teams post for players/opponents/grounds; anyone interested
 *  reaches out via the shared contact or a one-tap WhatsApp message. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Pill, Button, SelectChip, textStyles } from './ui';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useListings } from '../data/hooks';
import { useAuth } from '../core/auth';
import { getMyPlayerId, deleteListing } from '../data/repos';
import { LISTING_KINDS, kindMeta, openWhatsApp, timeAgo } from '../core/connect';
import type { Listing, ListingKind, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ConnectBoard() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [kind, setKind] = useState<ListingKind | 'all'>('all');
  const [sport, setSport] = useState<SportId | 'all'>('all');
  const { listings, reload } = useListings({
    kind: kind === 'all' ? undefined : kind,
    sport: sport === 'all' ? undefined : sport,
  });

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
    openWhatsApp(l.contactPhone, `Hi ${who}, I saw your Sportfolio post (${kindMeta(l.kind).short}) and I'm interested.`);
  };

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Button label="✏️ Post a listing" onPress={() => nav.navigate('CreateListing')} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        <SelectChip label="All posts" active={kind === 'all'} onPress={() => setKind('all')} />
        {LISTING_KINDS.map((k) => (
          <SelectChip key={k.kind} label={`${k.icon} ${k.short}`} active={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        <SelectChip label="All sports" active={sport === 'all'} onPress={() => setSport('all')} />
        {SPORT_LIST.map((s) => (
          <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sport === s.id} onPress={() => setSport(s.id)} />
        ))}
      </ScrollView>

      {listings.length === 0 && (
        <Text style={textStyles.muted}>No posts here yet. Be the first — tap “Post a listing”.</Text>
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
                <TouchableOpacity style={st.waBtn} activeOpacity={0.85} onPress={() => reachOut(l)}>
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
