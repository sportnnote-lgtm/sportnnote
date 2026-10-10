/**
 * Correct a finished match (parity #05): stage removals / player changes on the
 * match's log, PREVIEW the recomputed score, result and per-player stat impact,
 * then PUBLISH as one public "Score edits" entry. Opened from the match's Info tab
 * (scorers and match hosts for 24 h after the end; tournament hosts anytime).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, FormError, ScreenTitle, textStyles } from '../components/ui';
import { EventCorrectionList } from '../components/EventCorrectionList';
import { notice } from '../core/confirm';
import { useAuth } from '../core/auth';
import { getSport } from '../sports/registry';
import { effectiveLog, replayLog, type AmendOp } from '../sports/amend';
import { planAmendment, publishAmendment } from '../data/amendments';
import { getMatch, getMatchEvents, getRoster, getTournaments } from '../data/repos';
import { mergeMatchConfig } from '../core/matchConfig';
import { manualResultLine } from '../core/matchResult';
import type { Match, MatchEventRecord, Player } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Plan = Awaited<ReturnType<typeof planAmendment>>;

export default function CorrectMatchScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CorrectMatch'>>();
  const { matchId, sport } = params;
  const plugin = getSport(sport);
  const { profile } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | undefined>(undefined);
  const [events, setEvents] = useState<MatchEventRecord[]>([]);
  const [rosters, setRosters] = useState<{ home: Player[]; away: Player[] }>({ home: [], away: [] });
  const [ops, setOps] = useState<AmendOp[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      const m = await getMatch(matchId);
      if (!m || !on) return;
      const tour = (await getTournaments()).find((t) => t.id === m.tournamentId);
      const [ev, home, away] = await Promise.all([
        getMatchEvents(matchId),
        getRoster(m.homeTeam.name, sport, m.homeTeam.id),
        getRoster(m.awayTeam.name, sport, m.awayTeam.id),
      ]);
      if (!on) return;
      setMatch(m);
      setConfig(mergeMatchConfig(tour?.formats?.[sport] as Record<string, unknown> | undefined, m.format as Record<string, unknown> | undefined));
      setEvents(ev);
      setRosters({ home, away });
    })();
    return () => { on = false; };
  }, [matchId, sport]);

  const log = useMemo(() => effectiveLog(events), [events]);
  const current = useMemo(() => replayLog(plugin, config, events), [plugin, config, events]);
  const home = match?.homeTeam.name ?? 'Home';
  const away = match?.awayTeam.name ?? 'Away';
  const resultText = (state: unknown) => {
    if (match?.result) return manualResultLine(match.result, home, away);
    const r = plugin.result?.(state as never);
    if (!r) return 'Unfinished';
    return r.winner === 'draw' ? 'Draw' : `${r.winner === 'home' ? home : away} won`;
  };
  // SD-01: set/game sports show the per-set line too ("2 – 1 · 6-4, 3-6, 7-6(4)").
  const score = (state: unknown) => {
    const s = plugin.summary(state as never);
    const line = plugin.scoreLine?.(state as never);
    return `${s.homeScore} – ${s.awayScore}${line ? ` · ${line}` : ''}`;
  };
  const nameOf = (id: string) => [...rosters.home, ...rosters.away].find((p) => p.id === id)?.fullName ?? 'A player';
  const unfinished = !!plan && !match?.result && !plugin.isComplete(plan.afterState as never);

  const preview = async () => {
    setBusy(true);
    try { setPlan(await planAmendment(matchId, sport, config, ops, lines, profile?.fullName ?? 'A scorer')); }
    catch (e) { notice('Couldn’t preview', e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try {
      await publishAmendment(matchId, sport, config, ops, lines, profile?.fullName ?? 'A scorer');
      notice('Corrections published', 'The score, stats and table now reflect your changes. They’re listed under Info → Score edits.');
      nav.goBack();
    } catch (e) {
      notice('Couldn’t publish', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!match) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Correct match" subtitle={`${home} vs ${away} · ${score(current)} · ${resultText(current)}`} />
        {!plan ? (
          <>
            <Text style={textStyles.muted}>Remove a mistaken entry or credit the right player. Nothing changes until you preview and publish.</Text>
            {plugin.CorrectionEditor ? (
              <plugin.CorrectionEditor log={log} config={config} ops={ops} onOps={(o, l) => { setOps(o); setLines(l); }}
                homeName={home} awayName={away} homeRoster={rosters.home} awayRoster={rosters.away} />
            ) : (
              <EventCorrectionList log={log} ops={ops} onOps={(o, l) => { setOps(o); setLines(l); }}
                homeName={home} awayName={away} homeRoster={rosters.home} awayRoster={rosters.away} />
            )}
          </>
        ) : (
          <View style={{ gap: theme.spacing(3) }}>
            <Card style={{ gap: theme.spacing(1) }}>
              <Text style={textStyles.h3}>Before → After</Text>
              <Text style={textStyles.body}>{score(plan.beforeState)} → {score(plan.afterState)}</Text>
              <Text style={textStyles.muted}>{resultText(plan.beforeState)} → {resultText(plan.afterState)}</Text>
            </Card>
            {plan.deltas.length > 0 && (
              <Card style={{ gap: theme.spacing(1) }}>
                <Text style={textStyles.h3}>Player stats</Text>
                {plan.deltas.map((d) => (
                  <Text key={`${d.playerId}${d.stat}`} style={textStyles.body}>{nameOf(d.playerId)} · {d.stat} {d.by > 0 ? `+${d.by}` : d.by}</Text>
                ))}
              </Card>
            )}
            <Card style={{ gap: theme.spacing(1) }}>
              <Text style={textStyles.h3}>Changes</Text>
              {lines.map((l) => <Text key={l} style={textStyles.body}>• {l}</Text>)}
            </Card>
            {unfinished ? <FormError message="This change leaves the match unfinished, so the result would be lost." /> : null}
          </View>
        )}
      </ScrollView>
      <View style={st.bar}>
        {!plan ? (
          <Button label={busy ? 'Working…' : `Preview (${ops.length} change${ops.length === 1 ? '' : 's'})`} onPress={() => void preview()} disabled={busy || ops.length === 0} />
        ) : (
          <View style={st.barRow}>
            <View style={{ flex: 1 }}><Button label="Back to edit" variant="ghost" onPress={() => setPlan(null)} /></View>
            <View style={{ flex: 1 }}><Button label={busy ? 'Publishing…' : 'Publish'} onPress={() => void publish()} disabled={busy || unfinished} /></View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(20) },
  bar: { padding: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bg },
  barRow: { flexDirection: 'row', gap: theme.spacing(3) },
});
