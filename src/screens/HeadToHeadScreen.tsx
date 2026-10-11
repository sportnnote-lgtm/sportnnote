/** SD-47 (GEN-16) — head-to-head: player vs player (individual sports) or team
 *  vs team. W-D-L, each side's form (last 5), and the meetings with scores,
 *  newest first. Reached from a match before it starts and from a player's
 *  sport profile ("Compare with…" — without a second player it lists everyone
 *  they've met, plus a search). Reads existing data only (stat lines + matches). */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, EmptyState, TextField, Button, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { matchLine } from '../sports/matchLine';
import { formatDay } from '../core/dates';
import { useMatches } from '../data/hooks';
import { getPlayerStatLines, getStatLinesForMatches, getPlayerNames, searchPlayers } from '../data/repos';
import {
  playerForm, playerHeadToHead, opponentsFaced, teamHeadToHead, teamForm, meetingText,
  type FormEntry, type HeadToHeadRecord,
} from '../data/headToHead';
import type { LineResult, Player, StatLine } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { openMatchViewer } from '../navigation/openMatch';
import { FormRow } from '../components/FormStrip';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HeadToHeadScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'HeadToHead'>>();
  const { sport, a, b, teamA, teamB } = params;
  const plugin = getSport(sport);
  const { matches } = useMatches();
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const teamMode = !!(teamA && teamB);

  // Player mode: a's lines, every line of a's matches in this sport (opponents
  // and b's lines in common matches), b's own lines (their form).
  const [aLines, setALines] = useState<StatLine[] | null>(null);
  const [matchLines, setMatchLines] = useState<StatLine[]>([]);
  const [bLines, setBLines] = useState<StatLine[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (teamMode || !a) return;
    let on = true;
    getPlayerStatLines(a).then(async (ls) => {
      const mine = ls.filter((l) => l.sport === sport && l.matchId && !l.eventId);
      const all = await getStatLinesForMatches([...new Set(mine.map((l) => l.matchId))]).catch(() => [] as StatLine[]);
      if (!on) return;
      setALines(mine);
      setMatchLines(all);
    }).catch(() => on && setALines([]));
    return () => { on = false; };
  }, [a, sport, teamMode]);
  useEffect(() => {
    if (teamMode || !b) { setBLines([]); return; }
    let on = true;
    getPlayerStatLines(b).then((ls) => on && setBLines(ls.filter((l) => l.sport === sport))).catch(() => {});
    return () => { on = false; };
  }, [b, sport, teamMode]);

  const opponents = useMemo(() => (a && !teamMode ? opponentsFaced(sport, a, matchLines, matchById) : []), [a, sport, matchLines, matchById, teamMode]);
  const nameKey = [a, b, ...opponents.map((o) => o.playerId)].filter(Boolean).join(',');
  useEffect(() => {
    if (!nameKey) return;
    let on = true;
    getPlayerNames(nameKey.split(',')).then((m) => on && setNames(m)).catch(() => {});
    return () => { on = false; };
  }, [nameKey]);

  const lineOf = (m: Parameters<typeof matchLine>[0], side: 'home' | 'away') => matchLine(m, side);
  const rec: HeadToHeadRecord | null = useMemo(() => {
    if (teamMode) return teamHeadToHead(teamA!, teamB!, matches.filter((m) => m.sport === sport), lineOf);
    if (!a || !b) return null;
    return playerHeadToHead(sport, a, b, [...matchLines, ...bLines], matchById, lineOf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMode, teamA, teamB, a, b, sport, matches, matchLines, bLines, matchById]);

  const sportMatches = matches.filter((m) => m.sport === sport);
  const teamName = (id?: string) => {
    const m = sportMatches.find((x) => x.homeTeam.id === id || x.awayTeam.id === id);
    return (m?.homeTeam.id === id ? m?.homeTeam.name : m?.awayTeam.name) ?? 'Team';
  };
  const aName = teamMode ? params.aName ?? teamName(teamA) : names.get(a ?? '') ?? params.aName ?? 'Player';
  const bName = teamMode ? params.bName ?? teamName(teamB) : names.get(b ?? '') ?? params.bName ?? 'Player';
  const aForm: FormEntry[] = teamMode ? teamForm(teamA!, sportMatches) : playerForm(aLines ?? [], matchById, sport);
  const bForm: FormEntry[] = teamMode ? teamForm(teamB!, sportMatches) : playerForm(bLines, matchById, sport);

  useEffect(() => { nav.setOptions({ title: 'Head-to-head' }); }, [nav]);

  const openSide = (which: 'a' | 'b') => {
    if (teamMode) nav.push('Team', { teamId: which === 'a' ? teamA! : teamB! });
    else { const id = which === 'a' ? a : b; if (id) nav.navigate('SportProfile', { playerId: id, sport }); }
  };

  // ── Player mode without an opponent: "Compare with…" ──
  if (!teamMode && a && !b) {
    return <ComparePicker sport={sport} a={a} aName={aName} opponents={opponents} names={names} loading={aLines === null}
      onPick={(id, name) => nav.setParams({ b: id, bName: name })} />;
  }

  const drawWord = sport === 'cricket' ? 'Tied' : 'Drawn';
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <Text style={textStyles.muted}>{plugin.icon} {plugin.name} · {teamMode ? 'team vs team' : 'player vs player'}</Text>
        <View style={st.vsRow}>
          <TouchableOpacity style={st.side} accessibilityRole="link" onPress={() => openSide('a')}>
            <Text style={st.sideName} numberOfLines={2}>{aName}</Text>
          </TouchableOpacity>
          <Text style={st.vs}>vs</Text>
          <TouchableOpacity style={[st.side, { alignItems: 'flex-end' }]} accessibilityRole="link" onPress={() => openSide('b')}>
            <Text style={[st.sideName, { textAlign: 'right' }]} numberOfLines={2}>{bName}</Text>
          </TouchableOpacity>
        </View>

        {!rec || (!teamMode && aLines === null) ? (
          <Text style={textStyles.muted}>Loading…</Text>
        ) : (
          <>
            <View style={st.tiles}>
              <Tile value={String(rec.won)} label={`${short(aName)} won`} accent />
              {(rec.drawn > 0 || CAN_DRAW.has(sport)) && <Tile value={String(rec.drawn)} label={drawWord} />}
              <Tile value={String(rec.lost)} label={`${short(bName)} won`} accent />
            </View>
            {rec.nr > 0 && <Text style={textStyles.muted}>+ {rec.nr} no result{rec.nr === 1 ? '' : 's'}</Text>}

            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>Form · last 5, latest first</Text>
              <FormRow name={aName} form={aForm} />
              <FormRow name={bName} form={bForm} />
            </Card>

            {rec.played === 0 ? (
              <EmptyState icon="⚔️" title="They haven’t met yet" hint={`No finished ${plugin.name.toLowerCase()} match between them on SportnNote.`} compact />
            ) : (
              <Card style={{ gap: theme.spacing(1) }}>
                <Text style={textStyles.muted}>{rec.played === 1 ? '1 meeting' : `${rec.played} meetings`} · {short(aName)}’s side first</Text>
                {rec.meetings.slice(0, 10).map((mt) => {
                  const m = matchById.get(mt.matchId);
                  return (
                    <TouchableOpacity key={mt.matchId} accessibilityRole="button" style={st.meetRow} onPress={() => m && openMatchViewer(nav, m)}>
                      <View style={[st.dot, { backgroundColor: COLOR[mt.result] }]}><Text style={st.dotText}>{mt.result}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={textStyles.body} numberOfLines={1}>{meetingText(mt).replace(/^(W|L|D|T|NR)\s?/, '') || '—'}</Text>
                        <Text style={[textStyles.muted, st.small]} numberOfLines={1}>{formatDay(mt.date)}</Text>
                      </View>
                      <Text style={st.chev}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </Card>
            )}
            {!teamMode && a && (
              <Button label="Compare with someone else" variant="ghost" onPress={() => nav.setParams({ b: undefined, bName: undefined })} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "Compare {A} with…": everyone they've met in this sport (most met first),
 *  or search any player of the sport. */
function ComparePicker({ sport, a, aName, opponents, names, loading, onPick }: {
  sport: RootStackParamList['HeadToHead']['sport']; a: string; aName: string; loading: boolean;
  opponents: ReturnType<typeof opponentsFaced>; names: Map<string, string>;
  onPick: (id: string, name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Player[]>([]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setFound([]); return; }
    let on = true;
    const t = setTimeout(() => {
      searchPlayers({ query, sports: [sport] }).then((ps) => on && setFound(ps.filter((p) => p.id !== a).slice(0, 12))).catch(() => {});
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [q, sport, a]);
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Text style={textStyles.h3}>Compare {aName} with…</Text>
        <TextField label="" value={q} onChange={setQ} placeholder="Search a player by name" autoCapitalize="words" />
        {found.length > 0 && (
          <Card style={{ gap: theme.spacing(1) }}>
            {found.map((p) => (
              <TouchableOpacity key={p.id} accessibilityRole="button" style={st.meetRow} onPress={() => onPick(p.id, p.fullName)}>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{p.fullName}</Text>
                <Text style={st.chev}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}
        <Text style={textStyles.muted}>{loading ? 'Loading…' : opponents.length ? 'Played against' : 'No opponents yet — search for a player above.'}</Text>
        {opponents.length > 0 && (
          <Card style={{ gap: theme.spacing(1) }}>
            {opponents.slice(0, 30).map((o) => (
              <TouchableOpacity key={o.playerId} accessibilityRole="button" style={st.meetRow} onPress={() => onPick(o.playerId, names.get(o.playerId) ?? 'Player')}>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{names.get(o.playerId) ?? 'Player'}</Text>
                <Text style={textStyles.muted}>{o.played}P</Text>
                <Text style={st.wl}>{o.won}-{o.drawn ? `${o.drawn}-` : ''}{o.lost}</Text>
                <Text style={st.chev}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <Card style={st.tile}>
      <Text style={[st.tileValue, !accent && { color: theme.colors.text }]}>{value}</Text>
      <Text style={[textStyles.muted, { textAlign: 'center' }]} numberOfLines={2}>{label}</Text>
    </Card>
  );
}

/** Sports where a match can end level (a tile for draws / ties even at 0). */
const CAN_DRAW = new Set<string>(['football', 'hockey', 'handball', 'kabaddi', 'chess', 'cricket']);
const short = (name: string) => name.split(' ')[0] || name;
const COLOR: Record<LineResult, string> = { W: theme.colors.primary, D: theme.colors.textMuted, T: theme.colors.textMuted, NR: theme.colors.border, L: theme.colors.danger };

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  vsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  side: { flex: 1 },
  sideName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  vs: { color: theme.colors.textMuted, fontWeight: '800' },
  tiles: { flexDirection: 'row', gap: theme.spacing(2) },
  tile: { flex: 1, alignItems: 'center', gap: theme.spacing(1) },
  tileValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#06120D', fontWeight: '900', fontSize: theme.font.small },
  meetRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  small: { fontSize: theme.font.small },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
  wl: { color: theme.colors.text, fontWeight: '800', minWidth: 44, textAlign: 'right' },
});
