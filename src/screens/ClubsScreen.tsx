/** "My teams" — the multi-sport Club list and the entry point to create one. Each
 *  row shows the team, its city and the sports it plays; tapping opens the team
 *  dashboard. This is the home of the Team Creation & Management system (spec §12). */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, ScreenTitle, LoadingState, EmptyState, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { getClubs, getClubSports } from '../data/repos';
import type { Club, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { displayableImage } from '../core/imageUrl';
import { isSupabaseConfigured } from '../core/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ClubsScreen() {
  const nav = useNavigation<Nav>();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sportsByClub, setSportsByClub] = useState<Record<string, SportId[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await getClubs();
    const pairs = await Promise.all(list.map(async (c) => [c.id, await getClubSports(c.id)] as const));
    setClubs(list);
    setSportsByClub(Object.fromEntries(pairs));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Teams" subtitle="One team, many sports" />
        <Button label="+ Create a team" onPress={() => nav.navigate('CreateClub')} />
        <Button label="Have an invite code? Join a team" variant="ghost" onPress={() => nav.navigate('JoinClub')} />

        {loading ? (
          <LoadingState />
        ) : clubs.length === 0 ? (
          <EmptyState icon="🛡️" title="No teams yet" hint="Create your team, pick the sports it plays, and add your teammates." />
        ) : (
          clubs.map((c) => {
            const sports = sportsByClub[c.id] ?? [];
            return (
              <TouchableOpacity key={c.id} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`}
                onPress={() => nav.navigate('ClubHome', { clubId: c.id })}>
                <Card style={st.row}>
                  {displayableImage(c.logoUrl, !isSupabaseConfigured) ? (
                    <Image source={{ uri: c.logoUrl! }} style={st.badgeImg} resizeMode="cover" />
                  ) : (
                    <View style={[st.badge, { backgroundColor: c.colorHex ?? theme.colors.primary }]}>
                      <Text style={st.badgeText}>{c.shortName?.slice(0, 3) || c.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{c.name}</Text>
                    <Text style={textStyles.muted}>
                      {c.city ? `${c.city} · ` : ''}{sports.length ? sports.map((s) => getSport(s).icon).join(' ') : 'No sports yet'}
                    </Text>
                  </View>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  badge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeImg: { width: 44, height: 44, borderRadius: 10 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
});
