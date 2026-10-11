/** SD-134 — a chess Swiss round as the arbiter runs it: numbered boards (Bd 1
 *  = the top board), the pairing sheet to share (WhatsApp) or print (A4, the
 *  SD-129 print helpers), and the ROUND RESULTS SHEET — every board's result
 *  on one screen (1-0 / ½-½ / 0-1, and +/−, −/+, 0-0 under "More"), saved
 *  together after one confirm. Each result goes through the game's own log,
 *  exactly as recording it on the game does. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, EmptyState, ScreenTitle, SelectChip, FormError, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { useLeagueData, useOrganizations, useTournamentById, useTournamentTeams } from '../data/hooks';
import { useAuth } from '../core/auth';
import { canManageTournament } from '../core/org';
import { getMyPlayerId } from '../data/repos';
import { teamStandings, standingsConfigFromFormat, swissRoundOf } from '../data/standings';
import { swissOpsOf, roundStatusText } from '../data/swissOps';
import { roundBoards, swissRoundsIn, pairingsText, pairingsSheet, pickLine, PICK_LABEL, type BoardPick, type RoundBoard } from '../sports/chess/roundSheet';
import { recordRoundResults } from '../data/chessRoundResults';
import { shareMessage } from '../core/share';
import { printSheet } from '../core/printSheet';
import { sheetDoc } from '../data/results/printSheets';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MAIN: BoardPick[] = ['1-0', '½-½', '0-1'];
const MORE: BoardPick[] = ['+/-', '-/+', '0-0'];
const show = (p: BoardPick) => (p === '+/-' ? '+/−' : p === '-/+' ? '−/+' : p);

export default function SwissRoundScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SwissRound'>>();
  const sport = params.sport ?? 'chess';
  const tournament = useTournamentById(params.tournamentId);
  const [nonce, setNonce] = useState(0);
  const { matches: all, players, loading } = useLeagueData(params.tournamentId, nonce);
  const entrants = useTournamentTeams(params.tournamentId, sport);
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [myId, setMyId] = useState<string | null>(null);
  React.useEffect(() => { let on = true; void getMyPlayerId(profile?.id).then((id) => on && setMyId(id)).catch(() => {}); return () => { on = false; }; }, [profile?.id]);
  const canEdit = tournament ? canManageTournament(tournament, orgs, myId) : false;

  const matches = useMemo(() => all.filter((m) => m.sport === sport), [all, sport]);
  const rounds = useMemo(() => swissRoundsIn(matches), [matches]);
  // a web URL hands the round over as text
  const [picked, setPicked] = useState<number | null>(Number(params.round) > 0 ? Number(params.round) : null);
  const round = picked ?? rounds[rounds.length - 1] ?? 1;
  const fmt = tournament?.formats?.[sport] as Record<string, unknown> | undefined;
  const cfg = useMemo(() => standingsConfigFromFormat(sport, fmt), [sport, fmt]);
  const ops = useMemo(() => swissOpsOf(fmt), [fmt]);
  // scores before this round (Pts on the sheet; the board order of older games)
  const before = useMemo(() => {
    const prev = matches.filter((m) => (swissRoundOf(m.stage) ?? 0) > 0 && (swissRoundOf(m.stage) ?? 0) < round);
    return new Map(teamStandings(prev, sport, cfg, 'swiss').map((r) => [r.teamId, r.points]));
  }, [matches, round, sport, cfg]);
  const boards = useMemo(() => roundBoards(matches, round, (id) => before.get(id) ?? 0), [matches, round, before]);
  const nameOf = (id: string) => {
    const t = entrants.find((x) => x.id === id);
    if (t) return t.name;
    for (const m of matches) { if (m.homeTeam.id === id) return m.homeTeam.name; if (m.awayTeam.id === id) return m.awayTeam.name; }
    return ops.late?.[id]?.name ?? 'Entrant';
  };
  const roundMatches = matches.filter((m) => swissRoundOf(m.stage) === round && m.status !== 'cancelled');
  const byes = [...new Set(roundMatches.flatMap((m) => m.byes ?? []))].map(nameOf);
  const everyone = [...new Set(matches.filter((m) => swissRoundOf(m.stage)).flatMap((m) => [m.homeTeam.id, m.awayTeam.id, ...(m.byes ?? [])]))];
  const notPaired = roundStatusText(ops, everyone, round, nameOf);

  const [picks, setPicks] = useState<Record<string, BoardPick>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = boards.filter((b) => !b.result);
  const chosen = open.filter((b) => picks[b.matchId]);
  const anyResult = boards.some((b) => b.result);

  const event = tournament?.name ?? 'Chess';
  const share = async (results: boolean) => {
    await shareMessage(pairingsText({ event, round, boards, byes, notPaired, results }), 'tournament');
  };
  const print = async (results: boolean) => {
    const html = sheetDoc({
      title: `${event} — Round ${round} ${results ? 'results' : 'pairings'}`,
      header: { name: event, ...(tournament?.city ? { city: tournament.city } : {}) },
      sheets: [pairingsSheet({ round, boards, byes, notPaired, results })],
    });
    const out = await printSheet(html, { autoPrint: true, fallbackText: pairingsText({ event, round, boards, byes, notPaired, results }) });
    if (out === 'failed') setError('Printing isn’t available here — use Share instead.');
  };

  const save = async () => {
    if (!chosen.length || busy) return;
    const lines = chosen.map((b) => pickLine(b, picks[b.matchId]));
    const ok = await askConfirm({
      title: `Save ${chosen.length} result${chosen.length === 1 ? '' : 's'} for round ${round}?`,
      message: `${lines.join('\n')}\n\nEach game closes with this result; the table and both players' profiles update.`,
      yesLabel: `Yes, save ${chosen.length}`, noLabel: 'No, keep editing', tone: 'danger',
    });
    if (!ok) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const byId = new Map(players.map((p) => [p.id, p]));
      const res = await recordRoundResults(chosen.map((b) => ({ match: matches.find((m) => m.id === b.matchId)!, pick: picks[b.matchId], white: b.white })), byId);
      const skipped = res.skipped.map((x) => {
        const b = boards.find((y) => y.matchId === x.matchId);
        return `Bd ${b?.no ?? '?'}: ${x.why === 'decided' ? 'already has a result' : x.why === 'locked' ? 'being scored on another phone' : x.message ?? 'not saved'}`;
      });
      setMsg(`✓ Saved ${res.saved.length} result${res.saved.length === 1 ? '' : 's'}.${skipped.length ? ` Not saved — ${skipped.join(' · ')}.` : ''}`);
      setPicks({});
      setNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the results');
    } finally { setBusy(false); }
  };

  const openGame = (b: RoundBoard) => {
    const m = matches.find((x) => x.id === b.matchId);
    if (!m) return;
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport, homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name, homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: canEdit,
    } as never);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`Round ${round}`} subtitle={`${event} · Swiss`} />
        {rounds.length > 1 && (
          <View style={st.chips}>
            {rounds.map((r) => <SelectChip key={r} label={`R${r}`} active={r === round} onPress={() => { setPicked(r); setPicks({}); setMsg(null); }} />)}
          </View>
        )}
        {loading ? <Text style={textStyles.muted}>Loading…</Text> : boards.length === 0 ? (
          <EmptyState icon="♟️" title="No games in this round" hint="Generate the round from Auto-generate fixtures." compact />
        ) : (
          <>
            <View style={st.chips}>
              <Button label="📤 Share pairings" variant="ghost" onPress={() => void share(false)} />
              <Button label="🖨 Print pairings" variant="ghost" onPress={() => void print(false)} />
              {anyResult && <Button label="📤 Share results" variant="ghost" onPress={() => void share(true)} />}
              {anyResult && <Button label="🖨 Print results" variant="ghost" onPress={() => void print(true)} />}
            </View>
            {byes.length ? <Text style={textStyles.muted}>Bye: {byes.join(', ')}</Text> : null}
            {notPaired ? <Text style={textStyles.muted}>Not paired — {notPaired}</Text> : null}
            <Text style={textStyles.muted}>White is named first · (n) = score before the round.{canEdit && open.length ? ' Tap each board’s result, then save them all at once.' : ''}</Text>

            {boards.map((b) => {
              const p = picks[b.matchId];
              return (
                <View key={b.matchId} style={[st.board, b.result ? st.boardDone : null]}>
                  <View style={st.rowBetween}>
                    <Text style={st.no}>Bd {b.no}</Text>
                    <Text style={[textStyles.body, st.flex]} numberOfLines={2}>
                      ♔ {b.whiteName} <Text style={st.pts}>({String(b.whitePts ?? 0).replace('.5', '½').replace(/^0½$/, '½')})</Text>
                      <Text style={textStyles.muted}>  –  </Text>
                      ♚ {b.blackName} <Text style={st.pts}>({String(b.blackPts ?? 0).replace('.5', '½').replace(/^0½$/, '½')})</Text>
                    </Text>
                    {b.result ? <Text style={st.result}>{b.result}</Text> : null}
                  </View>
                  {!b.result && canEdit && (
                    <>
                      <View style={st.picks}>
                        {(more[b.matchId] ? [...MAIN, ...MORE] : MAIN).map((k) => (
                          <TouchableOpacity key={k} accessibilityRole="button" accessibilityLabel={`Board ${b.no}: ${PICK_LABEL[k]}`} accessibilityState={{ selected: p === k }}
                            onPress={() => setPicks((cur) => { const n = { ...cur }; if (n[b.matchId] === k) delete n[b.matchId]; else n[b.matchId] = k; return n; })}
                            style={[st.pick, p === k && st.pickOn]}>
                            <Text style={[st.pickText, p === k && st.pickTextOn]}>{show(k)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={st.rowBetween}>
                        <Text style={st.link} accessibilityRole="button" onPress={() => setMore((cur) => ({ ...cur, [b.matchId]: !cur[b.matchId] }))}>
                          {more[b.matchId] ? 'Fewer' : 'More: forfeits, 0-0'}
                        </Text>
                        <Text style={st.link} accessibilityRole="button" onPress={() => openGame(b)}>Open game ›</Text>
                      </View>
                      {p ? <Text style={st.meta}>{PICK_LABEL[p]}</Text> : null}
                    </>
                  )}
                  {(b.result || !canEdit) && <Text style={st.link} accessibilityRole="button" onPress={() => openGame(b)}>Open game ›</Text>}
                </View>
              );
            })}
            <FormError message={error} />
            {msg ? <Text style={[textStyles.body, { color: theme.colors.primary }]}>{msg}</Text> : null}
            {canEdit && open.length > 0 && (
              <Button label={busy ? 'Saving…' : chosen.length ? `✓ Save ${chosen.length} result${chosen.length === 1 ? '' : 's'}…` : '✓ Save results'} onPress={() => void save()} disabled={!chosen.length || busy} />
            )}
            {canEdit && open.length === 0 && (
              <Button label="⚡ Next round — Auto-generate fixtures" variant="ghost" onPress={() => nav.navigate('GenerateFixtures', { tournamentId: params.tournamentId, sport })} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  flex: { flex: 1 },
  board: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  boardDone: { backgroundColor: theme.colors.surfaceAlt },
  no: { color: theme.colors.textMuted, fontWeight: '900', fontSize: theme.font.small, width: 40 },
  pts: { color: theme.colors.textMuted, fontSize: theme.font.small },
  result: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.h3 },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  pick: { minWidth: 64, minHeight: 44, flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  pickOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '22' },
  pickText: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.body },
  pickTextOn: { color: theme.colors.text },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
