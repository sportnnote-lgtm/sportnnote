/** SD-138 — tournament history pieces shared by the standings, bracket, team
 *  journey and profile screens: how a level match was decided (in the sport's
 *  own words), a refresh tick while something is live, the qualified /
 *  eliminated marker, and one entrant's journey (group → knockout → place). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import { PODIUM } from './Rank';
import { getSport } from '../sports/registry';
import { matchLineFor } from '../sports/matchLine';
import { deciderFromStatus, ordinal, teamJourney, type JourneyOptions, type JourneyStep, type RowMark, type TeamJourney } from '../data/tournamentHistory';
import { getTournaments } from '../data/repos';
import { standingsConfigFromFormat } from '../data/standings';
import { structureFromFormat } from '../data/structureConfig';
import { bronzeRuleFor } from '../data/medalStandings';
import type { Match, SportId, Tournament } from '../core/types';

/** How a finished match was settled — penalties, shoot-out, 7 m throws, Super
 *  Over, Armageddon, golden raid, overtime — read from the sport's own status
 *  line. undefined for a plain result (or an old snapshot that can't be read). */
export function matchDecider(m: Match): string | undefined {
  if (m.status !== 'completed' || m.state == null) return undefined;
  try {
    const plugin = getSport(m.sport);
    const line = plugin?.summary?.(m.state as never)?.statusLine;
    const winnerName = m.winner === 'home' ? m.homeTeam.name : m.winner === 'away' ? m.awayTeam.name : undefined;
    return deciderFromStatus(line, m.homeTeam.name, m.awayTeam.name, winnerName);
  } catch {
    return undefined;
  }
}

/** The UI hooks a journey needs (sport words + set/game lines). */
export const journeyUiOptions: Pick<JourneyOptions, 'decider' | 'line'> = {
  decider: matchDecider,
  line: (m, teamId) => {
    try { return matchLineFor(m, teamId); } catch { return ''; }
  },
};

/** Refetch every `ms` while the screen is focused and `active` (a live match). */
export function useLiveRefresh(active: boolean, bump: () => void, ms = 30_000) {
  useFocusEffect(useCallback(() => {
    if (!active) return undefined;
    const id = setInterval(bump, ms);
    return () => clearInterval(id);
  }, [active, bump, ms]));
}

/** "Q" / "E" tag beside a name in a final group table. */
export function MarkTag({ mark, via }: { mark?: RowMark; via?: 'direct' | 'best' }) {
  if (!mark) return null;
  const q = mark === 'qualified';
  return (
    <View style={[st.tag, { borderColor: (q ? theme.colors.primary : theme.colors.textMuted) + '88' }]}
      accessibilityLabel={q ? (via === 'best' ? 'Qualified as a best-placed team' : 'Qualified') : 'Eliminated'}>
      <Text style={[st.tagText, { color: q ? theme.colors.primary : theme.colors.textMuted }]}>{q ? (via === 'best' ? 'Q*' : 'Q') : 'E'}</Text>
    </View>
  );
}

/** A small red "● LIVE" dot for a row whose match is in play. */
export function LiveDot() {
  return <Text style={st.liveDot} accessibilityLabel="Playing now">●</Text>;
}

const OUTCOME: Record<JourneyStep['outcome'], { label: string; color: string }> = {
  won: { label: 'Won', color: theme.colors.primary },
  lost: { label: 'Lost', color: theme.colors.danger },
  live: { label: '● Live', color: theme.colors.danger },
  upcoming: { label: 'Next', color: theme.colors.textMuted },
  awaiting: { label: 'To be decided', color: theme.colors.accent },
};

/** One entrant's whole tournament: group finish → each knockout round → place. */
export function JourneyView({ j, onGroup, onMatch, onOpponent }: {
  j: TeamJourney;
  onGroup?: () => void;
  onMatch?: (matchId: string) => void;
  onOpponent?: (teamId: string) => void;
}) {
  const head = j.state === 'champion' ? '🏆 Champions'
    : j.finish ? `Finished ${j.finish.label === 'Runners-up' ? 'runners-up' : j.finish.label}`
    : j.plateWinner ? '🍽️ Plate winner'
    : j.state === 'out' ? 'Out' : 'Still in it';
  const medal = j.finish && j.finish.position <= 3 ? PODIUM[j.finish.position - 1] : undefined;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Card style={[{ gap: theme.spacing(1) }, medal ? { borderColor: medal + '88' } : null]}>
        <View style={st.row}>
          <View style={[st.dot, { backgroundColor: j.colorHex ?? theme.colors.surfaceAlt }]} />
          <Text style={[textStyles.h3, { flex: 1 }]} numberOfLines={1}>{j.name}</Text>
          <Text style={[st.state, medal ? { color: medal } : j.state === 'out' ? { color: theme.colors.textMuted } : null]}>{head}</Text>
        </View>
        {!!j.summary && <Text style={textStyles.muted}>{j.summary}</Text>}
        {j.plateWinner && j.finish ? <Text style={st.plate}>🍽️ Plate winner</Text> : null}
      </Card>

      {j.phases.map((p) => (
        <TouchableOpacity key={p.key} accessibilityRole="button" activeOpacity={0.85} disabled={!onGroup} onPress={onGroup}
          accessibilityLabel={`${p.title}: ${ordinal(p.position)} of ${p.of}${p.status === 'final' ? '' : ' so far'}${p.mark ? `, ${p.mark}` : ''}. Open the table`}>
          <Card style={{ gap: theme.spacing(1) }}>
            <View style={st.row}>
              <Text style={[st.stepLabel, { flex: 1 }]}>{p.title}{p.status === 'final' ? ' — final' : p.status === 'live' ? ' · live' : ''}</Text>
              {p.mark ? <MarkTag mark={p.mark} via={p.via} /> : null}
              {onGroup ? <Text style={st.chev}>›</Text> : null}
            </View>
            <Text style={textStyles.body}>
              {ordinal(p.position)} of {p.of}{p.status === 'final' ? '' : ' (so far)'} · {p.points} pts from {p.played}
            </Text>
            {p.mark ? <Text style={textStyles.muted}>{p.mark === 'qualified' ? (p.via === 'best' ? 'Through as one of the best-placed teams' : 'Through to the next stage') : 'Did not go through'}</Text> : null}
          </Card>
        </TouchableOpacity>
      ))}

      {j.steps.length > 0 && <Text style={st.section}>Knockout</Text>}
      {j.steps.map((s) => {
        const o = OUTCOME[s.outcome];
        return (
          <TouchableOpacity key={s.key} accessibilityRole="button" activeOpacity={0.85} disabled={!onMatch || !s.matchId}
            onPress={() => s.matchId && onMatch?.(s.matchId)}
            accessibilityLabel={`${s.label}: ${o.label} against ${s.opponentName}${s.score ? `, ${s.score}` : ''}${s.decider ? `, ${s.decider}` : ''}`}>
            <Card style={[{ gap: theme.spacing(1) }, s.outcome === 'live' ? st.liveCard : null]}>
              <View style={st.row}>
                <Text style={[st.stepLabel, { flex: 1 }]}>{s.label}</Text>
                <Text style={[st.outcome, { color: o.color }]}>{o.label}</Text>
              </View>
              <View style={st.row}>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>
                  v{' '}
                  <Text style={st.opp} onPress={s.opponentId && onOpponent ? () => onOpponent(s.opponentId!) : undefined}>{s.opponentName}</Text>
                </Text>
                {s.score ? <Text style={st.score}>{s.score}</Text> : null}
              </View>
              {s.legs && s.legs.length > 1 ? <Text style={textStyles.muted}>{s.legs.join(' · ')}</Text> : null}
              {s.decider ? <Text style={st.decider}>{s.decider}</Text> : null}
              {s.outcome === 'upcoming' && s.startsAt ? (
                <Text style={textStyles.muted}>{new Date(s.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** The journey of one entrant in one tournament's sport, with that
 *  tournament's own table rules and structure. */
export function journeyFor(t: Pick<Tournament, 'formats' | 'scoring'> | undefined, matches: Match[], sport: SportId, teamId: string): TeamJourney | null {
  const fmt = t?.formats?.[sport] as Record<string, unknown> | undefined;
  const struct = structureFromFormat(fmt);
  return teamJourney(matches, sport, teamId, standingsConfigFromFormat(sport, fmt), {
    ...journeyUiOptions,
    advanceTopN: struct?.shape === 'groups' ? struct.advanceTopN : undefined,
    advanceBest: struct?.shape === 'groups' ? struct.advanceBest : undefined,
    shape: struct?.shape ?? null,
    bronze: bronzeRuleFor(t?.scoring, sport),
  });
}

export interface JourneyEntry { tournamentId: string; sport: SportId; teamId: string }

/** "Tournaments" rows (team page, player sport profile): each tournament the
 *  entrant played, how far they got — tap for the whole journey. */
export function TournamentJourneyList({ entries, matches, onOpen, title = 'Tournaments', max = 5 }: {
  entries: JourneyEntry[];
  matches: Match[];
  onOpen: (e: JourneyEntry) => void;
  title?: string;
  max?: number;
}) {
  const [tours, setTours] = useState<Map<string, Tournament>>(new Map());
  const key = entries.map((e) => e.tournamentId).join(',');
  useEffect(() => {
    if (!key) return undefined;
    let on = true;
    getTournaments({ includeDeleted: true }).then((ts) => on && setTours(new Map(ts.map((t) => [t.id, t])))).catch(() => {});
    return () => { on = false; };
  }, [key]);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => entries.map((e) => {
    const t = tours.get(e.tournamentId);
    const j = journeyFor(t, matches.filter((m) => m.tournamentId === e.tournamentId), e.sport, e.teamId);
    return { e, t, j };
  }).filter((r) => r.j && (r.j.phases.length > 0 || r.j.steps.length > 0)), [entries, tours, matches]);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, max);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>🧭 {title}</Text>
      {shown.map(({ e, t, j }) => {
        const head = j!.state === 'champion' ? '🏆 Champions' : j!.finish ? j!.finish.label : j!.plateWinner ? '🍽️ Plate winner' : j!.state === 'out' ? 'Out' : 'Still in';
        return (
          <TouchableOpacity key={`${e.tournamentId}|${e.sport}|${e.teamId}`} accessibilityRole="button" activeOpacity={0.85} onPress={() => onOpen(e)}
            accessibilityLabel={`${t?.name ?? 'Tournament'}, ${getSport(e.sport).name}: ${head}. ${j!.summary}. Open the journey`}>
            <Card style={{ gap: 2 }}>
              <View style={st.row}>
                <Text style={[textStyles.body, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>{getSport(e.sport).icon} {t?.name ?? 'Tournament'}</Text>
                <Text style={st.state}>{head}</Text>
                <Text style={st.chev}>›</Text>
              </View>
              <Text style={textStyles.muted} numberOfLines={2}>{j!.summary}</Text>
            </Card>
          </TouchableOpacity>
        );
      })}
      {rows.length > max && (
        <Text style={st.more} accessibilityRole="button" onPress={() => setAll((v) => !v)}>{all ? 'Show less' : `Show all ${rows.length}`}</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  more: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  state: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
  plate: { color: theme.colors.accent, fontWeight: '800', fontSize: theme.font.small },
  section: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  outcome: { fontSize: theme.font.small, fontWeight: '900' },
  opp: { fontWeight: '700', color: theme.colors.text },
  score: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.body, fontVariant: ['tabular-nums'] },
  decider: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  liveCard: { borderColor: theme.colors.danger + '99' },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3 },
  tag: { borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: 4, minWidth: 20, alignItems: 'center' },
  tagText: { fontSize: theme.font.tiny, fontWeight: '900' },
  liveDot: { color: theme.colors.danger, fontSize: theme.font.tiny },
});
