/** Cricket batting-order editor. Unlike the court sports (which place players in
 *  fixed positions on a Court), cricket's lineup is an ORDERED XI 1-11 plus a
 *  designated wicket-keeper. The organizer taps players in the order they bat —
 *  each gets a number; the first N (the format's players-a-side) are the ordered
 *  `starters`, the rest are `subs`. Because the live scoring roster is built as
 *  `[...starters, ...subs]` (see LiveScoringScreen.applySquad), that order flows
 *  straight through: openers default to #1 & #2 and each wicket suggests the next
 *  batter in order — no reducer change needed. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Button, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { getRoster, getMatchSquads, setMatchSquad } from '../data/repos';
import { matchEligibility } from '../core/eligibility';
import { splitBattingOrder } from '../sports/cricket/lineup';
import type { Player } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CricketLineupScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CricketLineup'>>();
  const { matchId, sport, homeTeamName, awayTeamName, homeColor, awayColor, playersPerSide = 11 } = params;

  const [side, setSide] = useState<'home' | 'away'>('home');
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);
  // Ordered picked ids + designated keeper, per side.
  const [order, setOrder] = useState<{ home: string[]; away: string[] }>({ home: [], away: [] });
  const [keeper, setKeeper] = useState<{ home?: string; away?: string }>({});
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([
        getRoster(homeTeamName, sport),
        getRoster(awayTeamName, sport),
        getMatchSquads(matchId),
      ]).then(([hr, ar, sq]) => {
        if (!on) return;
        setHomeRoster(hr);
        setAwayRoster(ar);
        // Rehydrate saved order = starters then subs (that's the batting order).
        setOrder({
          home: [...sq.home.starters, ...sq.home.subs],
          away: [...sq.away.starters, ...sq.away.subs],
        });
        setKeeper({ home: sq.home.keeperId, away: sq.away.keeperId });
      });
      return () => { on = false; };
    }, [matchId, homeTeamName, awayTeamName, sport])
  );

  const roster = side === 'home' ? homeRoster : awayRoster;
  const picked = order[side];
  const teamName = side === 'home' ? homeTeamName : awayTeamName;
  const { starters, subs } = splitBattingOrder(picked, playersPerSide);

  // Tap a player: append to the order if new, else remove (the rest renumber
  // automatically since position IS array index). Eligibility only gates ADDING —
  // a picked player can always be removed (e.g. the Remove link passes a bare id).
  const toggle = (id: string, player?: Player) => {
    const isPicked = picked.includes(id);
    if (!isPicked && player && !matchEligibility(player).ok) return; // can't add an unverified player
    setOrder((o) => {
      const cur = o[side];
      return { ...o, [side]: isPicked ? cur.filter((x) => x !== id) : [...cur, id] };
    });
    // Dropping a player also clears their keeper flag.
    if (isPicked && keeper[side] === id) setKeeper((k) => ({ ...k, [side]: undefined }));
  };

  const battingNo = (id: string) => picked.indexOf(id); // 0-based; -1 if not picked
  const nameById = (id: string) => roster.find((p) => p.id === id)?.fullName ?? '—';

  const save = async () => {
    setBusy(true);
    for (const sd of ['home', 'away'] as const) {
      const { starters: st, subs: sb } = splitBattingOrder(order[sd], playersPerSide);
      // Only keep a keeper flag if that player is actually in the XI.
      const kp = keeper[sd] && st.includes(keeper[sd]!) ? keeper[sd] : undefined;
      await setMatchSquad(matchId, sd, { starters: st, subs: sb, keeperId: kp });
    }
    setBusy(false);
    nav.goBack();
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Batting order" subtitle="Tap players in the order they bat" />

        <View style={st.tabs}>
          <SelectChip label={homeTeamName} active={side === 'home'} onPress={() => setSide('home')} dotColor={homeColor} />
          <SelectChip label={awayTeamName} active={side === 'away'} onPress={() => setSide('away')} dotColor={awayColor} />
        </View>

        <Text style={textStyles.muted}>
          The first {playersPerSide} form the batting order ({1}–{playersPerSide}); anyone tapped after that is a substitute.
          Only verified players can be added.
        </Text>

        {/* The ordered batting lineup so far */}
        <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>
          {teamName} lineup — <Text style={starters.length >= playersPerSide ? st.countFull : undefined}>{starters.length}/{playersPerSide}</Text>
        </Text>
        {picked.length === 0 ? (
          <Text style={textStyles.muted}>No one picked yet — tap players below to build the order.</Text>
        ) : (
          picked.map((id, i) => {
            const isXI = i < playersPerSide;
            const isKeeper = keeper[side] === id;
            return (
              <View key={id} style={[st.orderRow, !isXI && st.benchRow]}>
                <Text style={[st.pos, !isXI && st.benchPos]}>{isXI ? i + 1 : 'SUB'}</Text>
                <Text style={[textStyles.body, { flex: 1 }]}>{nameById(id)}{isKeeper ? ' †' : ''}</Text>
                <TouchableOpacity accessibilityRole="button"
                  activeOpacity={0.8}
                  onPress={() => setKeeper((k) => ({ ...k, [side]: k[side] === id ? undefined : id }))}
                  style={[st.wkBtn, isKeeper && st.wkBtnActive]}
                >
                  <Text style={[st.wkText, isKeeper && st.wkTextActive]}>† WK</Text>
                </TouchableOpacity>
                <Text style={st.remove} accessibilityRole="button" accessibilityLabel={`Remove ${nameById(id)}`} onPress={() => toggle(id)}>Remove</Text>
              </View>
            );
          })
        )}

        {/* Pick from the full squad */}
        <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>Squad</Text>
        <View style={st.chips}>
          {roster.length === 0 && <EmptyState icon="👥" title="No squad for this team yet" compact />}
          {roster.map((p) => {
            const elig = matchEligibility(p);
            const no = battingNo(p.id);
            const label = no >= 0 ? `${no < playersPerSide ? no + 1 : 'S'}. ${p.fullName}` : p.fullName;
            return (
              <SelectChip
                key={p.id}
                label={elig.ok ? label : `🔒 ${p.fullName}`}
                active={no >= 0}
                onPress={() => toggle(p.id, p)}
              />
            );
          })}
        </View>

        {subs.length > 0 && (
          <Text style={[textStyles.muted, { marginTop: theme.spacing(1) }]}>
            Substitutes: {subs.map(nameById).join(', ')}
          </Text>
        )}

        <Button label={busy ? 'Saving…' : 'Save batting order'} onPress={save} style={{ marginTop: theme.spacing(2) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(2) },
  tabs: { flexDirection: 'row', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  benchRow: { opacity: 0.65, borderStyle: 'dashed' },
  pos: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.body },
  benchPos: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  wkBtn: {
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2.5), borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt,
  },
  wkBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  wkText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  wkTextActive: { color: '#06120D' },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  countFull: { color: theme.colors.primary },
});
