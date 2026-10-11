/** SD-48 — the tie page: one team-v-team fixture of N rubbers. The running
 *  score (½ for a drawn chess board), both lineups, and every rubber with its
 *  players and live status. Tapping a rubber opens the normal scoring screen.
 *  SD-127: each team's captain / vice-captain / team admin enters their own
 *  side's lineup (the tie host can still enter both). Lineups are sealed:
 *  names stay hidden until both are in (live: kept on the server, not just
 *  hidden here), and after the exchange only the host can change one. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, FieldLabel, FormError, SelectChip, textStyles } from './ui';
import { PODIUM } from './Rank';
import { formatShort } from '../core/time';
import { canManageTeam, getRoster, getTieLineups, getTieRubbers, saveTieLineup, settleTie, setTieAbc, type TieLineupView } from '../data/repos';
import { deriveSeries, type Series } from '../data/series';
import {
  resolveTie, tieSpecOf, lineupOf, rubberPlayers, rubberLabel, sideLetters, lineupProblems, boardsByRating,
  fmtPts, rubberSize, lineupEntryRule, LINEUP_REFUSAL_TEXT, type TieLineup, type TieSpec, type RubberState,
} from '../data/teamTie';
import { chessRatingsOf, ratingListFor, ratingOn } from '../data/chessRatings';
import { matchLine } from '../sports/matchLine';
import type { Match, Player, Role } from '../core/types';

const STATE_TEXT: Record<RubberState, string> = {
  scheduled: '', live: '● LIVE', won: 'FT', drawn: '½–½', unplayed: 'Not played', dead: 'Dead rubber', cancelled: 'Cancelled',
};

export function TeamTieView({ initial, canManage, tz, onOpen, me }: {
  initial: Series;
  canManage: boolean;
  tz?: string;
  onOpen: (m: Match) => void;
  /** who is looking — for the captain's "Enter our lineup" (demo / old database) */
  me?: { playerId?: string | null; profileId?: string; role?: Role };
}) {
  const [rubbers, setRubbers] = useState<Match[]>(initial.legs);
  const [view, setView] = useState<TieLineupView | null>(null);
  const reload = useCallback(() => getTieRubbers(initial.id).then(async (r) => {
    if (r.length) setRubbers(r);
    setView(await getTieLineups(initial.id, r.length ? r : undefined).catch(() => null));
  }), [initial.id]);
  // Settle on open (stop-mode rubbers set aside / restored) — the host's
  // device can always write them, whoever scored the deciding rubber.
  useFocusEffect(useCallback(() => {
    let on = true;
    (canManage ? settleTie(initial.id).catch(() => null) : Promise.resolve(null)).then(() => { if (on) void reload(); });
    return () => { on = false; };
  }, [canManage, initial.id, reload]));

  const series = useMemo(() => deriveSeries(rubbers)[0] ?? initial, [rubbers, initial]);
  const spec = useMemo(() => rubbers.map(tieSpecOf).find(Boolean) ?? null, [rubbers]);
  const tie = useMemo(() => resolveTie(series), [series]);
  const A = series.teamA ?? rubbers[0]?.homeTeam;
  const B = series.teamB ?? rubbers[0]?.awayTeam;

  const [rosters, setRosters] = useState<{ home: Player[]; away: Player[] }>({ home: [], away: [] });
  useEffect(() => {
    let on = true;
    if (!A || !B) return;
    Promise.all([getRoster(A.name, series.sport, A.id), getRoster(B.name, series.sport, B.id)])
      .then(([h, a]) => on && setRosters({ home: h, away: a }));
    return () => { on = false; };
  }, [A?.id, B?.id, series.sport]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id?: string) => [...rosters.home, ...rosters.away].find((p) => p.id === id)?.fullName ?? 'Player';

  // The captains' rights: the server says (get_tie_lineups); demo / an older
  // database asks canManageTeam per side.
  const [mgrLocal, setMgrLocal] = useState<{ home: boolean; away: boolean }>({ home: false, away: false });
  useEffect(() => {
    let on = true;
    if (!A || !B || view?.can) return;
    const ctx = { profileId: me?.profileId, myPlayerId: me?.playerId, role: me?.role };
    Promise.all([canManageTeam(A.id, ctx).catch(() => false), canManageTeam(B.id, ctx).catch(() => false)])
      .then(([h, a]) => on && setMgrLocal({ home: h, away: a }));
    return () => { on = false; };
  }, [A?.id, B?.id, view?.can, me?.playerId, me?.profileId, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const isHost = view?.can ? view.can.host : canManage;
  const manages = (side: 'home' | 'away') => (view?.can ? view.can[side] : mgrLocal[side]);

  const lineups = {
    home: view ? view.home.lineup : lineupOf(rubbers, 'home'),
    away: view ? view.away.lineup : lineupOf(rubbers, 'away'),
  };
  const isIn = { home: view ? view.home.in : !!lineups.home, away: view ? view.away.in : !!lineups.away };
  const bothIn = isIn.home && isIn.away;
  const [editing, setEditing] = useState<'home' | 'away' | null>(null);

  if (!spec || !A || !B) return null;
  const winnerName = tie.winnerId === A.id ? A.name : tie.winnerId === B.id ? B.name : null;
  const started = rubbers.some((m) => m.status === 'live' || m.status === 'completed');

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {/* Score */}
      <View style={st.board}>
        <Side name={A.name} color={A.colorHex} win={tie.winnerId === A.id} />
        <View style={st.scoreWrap}>
          <Text style={[st.score, tie.winnerId === A.id && st.win]}>{fmtPts(tie.ptsA)}</Text>
          <Text style={st.sep}>–</Text>
          <Text style={[st.score, tie.winnerId === B.id && st.win]}>{fmtPts(tie.ptsB)}</Text>
        </View>
        <Side name={B.name} color={B.colorHex} win={tie.winnerId === B.id} right />
      </View>
      <Text style={st.summary}>{tie.summary}</Text>
      {winnerName ? <View style={st.champ}><Text style={st.champText}>🏆 {winnerName} win the tie</Text></View> : null}
      {tie.drawn ? <View style={st.champ}><Text style={st.champText}>🤝 Tie drawn — 1 match point each</Text></View> : null}
      {!spec.boards ? (
        <Text style={textStyles.muted}>
          {spec.dead === 'play' ? '▶️ Every rubber is played — dead rubbers count for the tie-breaks.' : '⏹ Rubbers after the decision are not played.'}
        </Text>
      ) : null}

      {/* ITTF draw: who plays ABC — before any lineup is in */}
      {canManage && !started && !isIn.home && !isIn.away && spec.pos && !spec.boards && /^[A-Z]$/.test(spec.pos.p[0] ?? '') && (
        <View style={{ gap: theme.spacing(1) }}>
          <FieldLabel hint="Drawn before the lineups (ITTF)">Who plays ABC?</FieldLabel>
          <View style={st.chips}>
            <SelectChip label={`${A.shortName || A.name} = ABC`} active={spec.abc === 'home'} onPress={() => { void setTieAbc(series.id, 'home').then(reload).catch(() => {}); }} />
            <SelectChip label={`${B.shortName || B.name} = ABC`} active={spec.abc === 'away'} onPress={() => { void setTieAbc(series.id, 'away').then(reload).catch(() => {}); }} />
            <SelectChip label="🪙 Draw it" active={false} onPress={() => { void setTieAbc(series.id, Math.random() < 0.5 ? 'home' : 'away').then(reload).catch(() => {}); }} />
          </View>
        </View>
      )}

      {/* Lineups */}
      <Text style={textStyles.h3}>Lineups</Text>
      {(['home', 'away'] as const).map((side) => {
        const team = side === 'home' ? A : B;
        const l = lineups[side];
        const inNow = isIn[side];
        const mine = manages(side);
        const rule = lineupEntryRule({ isHost, managesSide: mine, sideIn: inNow, otherIn: isIn[side === 'home' ? 'away' : 'home'], started });
        const letters = sideLetters(spec, side);
        return (
          <View key={side} style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.teamName} numberOfLines={1}>{team.name}{letters.length && !spec.boards && /^[A-Z]$/.test(letters[0]) ? ` · ${letters.join('')}` : ''}</Text>
              <Text style={[st.pill, inNow ? st.pillOk : null]}>{inNow ? '✓ In' : 'Not entered'}</Text>
            </View>
            {l ? (
              <Text style={st.lineText}>
                {letters.length
                  ? letters.map((x) => `${spec.boards ? `B${x}` : /^\d+$/.test(x) ? `No.${x}` : x} ${nameOf(l.pos[x])}`).join(' · ')
                  : spec.rubbers.map((r, i) => (r.p.length ? null : `${rubberLabel(spec, i)}: ${(l.pairs[String(i)] ?? []).map(nameOf).join(' / ')}`)).filter(Boolean).join(' · ')}
              </Text>
            ) : inNow ? <Text style={textStyles.muted}>Names show once both lineups are in.</Text> : null}
            {rule.ok && editing !== side && (
              <Button label={inNow ? 'Change lineup' : mine && !isHost ? 'Enter our lineup' : `Enter ${team.shortName || team.name}'s lineup`} variant="ghost" onPress={() => setEditing(side)} />
            )}
            {!rule.ok && rule.reason === 'exchanged' && mine ? <Text style={textStyles.muted}>{LINEUP_REFUSAL_TEXT.exchanged}</Text> : null}
            {editing === side && (
              <LineupEditor spec={spec} side={side} roster={side === 'home' ? rosters.home : rosters.away} initial={l}
                onCancel={() => setEditing(null)}
                onSave={async (next) => { await saveTieLineup(series.id, side, next); setEditing(null); await reload(); }} />
            )}
          </View>
        );
      })}
      {!bothIn && <Text style={textStyles.muted}>Each rubber gets its players once both lineups are in.</Text>}

      {/* Rubbers */}
      <Text style={textStyles.h3}>Rubbers</Text>
      {tie.rubbers.map(({ m, state }, i) => {
        const h = rubberPlayers(spec, i, 'home', lineups.home);
        const a = rubberPlayers(spec, i, 'away', lineups.away);
        const live = state === 'live';
        const wSide = m.status === 'completed' && (m.winner === 'home' || m.winner === 'away') ? m.winner : undefined;
        const off = state === 'unplayed' || state === 'cancelled';
        const line = m.status === 'completed' ? matchLine(m) : '';
        return (
          <TouchableOpacity key={m.id} accessibilityRole="button" accessibilityLabel={`Rubber ${i + 1}, ${rubberLabel(spec, i)}`} activeOpacity={0.85}
            style={[st.rubber, live && st.rubberLive, off && st.rubberOff]} onPress={() => onOpen(m)}>
            <View style={st.rowBetween}>
              <Text style={st.rubberNo}>{i + 1} · {rubberLabel(spec, i)}</Text>
              <Text style={[st.status, live && st.statusLive]}>{STATE_TEXT[state] || formatShort(m.startsAt, tz)}</Text>
            </View>
            <View style={st.rowBetween}>
              <Text style={[st.player, wSide === 'home' && st.win]} numberOfLines={2}>{bothIn && h ? h.map(nameOf).join(' / ') : A.shortName || A.name}</Text>
              {m.score && m.status !== 'scheduled' ? <Text style={st.rubberScore}>{fmtPts(m.score.home)}–{fmtPts(m.score.away)}</Text> : <Text style={st.vs}>v</Text>}
              <Text style={[st.player, st.right, wSide === 'away' && st.win]} numberOfLines={2}>{bothIn && a ? a.map(nameOf).join(' / ') : B.shortName || B.name}</Text>
            </View>
            {line ? <Text style={st.line} numberOfLines={1}>{line}</Text> : null}
            {state === 'unplayed' ? <Text style={st.note}>The tie was decided before this rubber.</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Side({ name, color, win, right }: { name: string; color?: string; win: boolean; right?: boolean }) {
  return (
    <View style={[st.side, right && { justifyContent: 'flex-end' }]}>
      {color && !right ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
      <Text style={[st.team, win && st.win, right && st.right]} numberOfLines={2}>{name}</Text>
      {color && right ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
    </View>
  );
}

/** Enter one team's lineup: a player per position (A / B / C, No.1 / No.2,
 *  board 1…), and the players for each nominated rubber. */
function LineupEditor({ spec, side, roster, initial, onCancel, onSave }: {
  spec: TieSpec;
  side: 'home' | 'away';
  roster: Player[];
  initial: TieLineup | null;
  onCancel: () => void;
  onSave: (l: TieLineup) => Promise<void>;
}) {
  const [l, setL] = useState<TieLineup>(() => initial ?? { pos: {}, pairs: {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const letters = sideLetters(spec, side);
  const problems = lineupProblems(spec, side, l);
  const posName = (x: string) => (spec.boards ? `Board ${x}` : /^\d+$/.test(x) ? `No.${x}` : x);
  const setPos = (x: string, id: string) => setL((p) => ({ ...p, pos: { ...p.pos, [x]: p.pos[x] === id ? '' : id } }));
  const togglePair = (i: number, id: string, size: number) => setL((p) => {
    const cur = (p.pairs[String(i)] ?? []).filter(Boolean);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : size === 1 ? [id] : [...cur, id].slice(-size);
    return { ...p, pairs: { ...p.pairs, [String(i)]: next } };
  });
  const list = ratingListFor(undefined);
  const ratingOf = (id: string) => ratingOn(chessRatingsOf(roster.find((p) => p.id === id)), list);
  if (!roster.length) return <Text style={textStyles.muted}>This team has no players yet — add them to the team first.</Text>;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      {spec.boards && (
        <SelectChip label="↕ Boards by rating (highest on board 1)" active={false}
          onPress={() => setL((p) => ({ ...p, pos: boardsByRating(spec, side, roster.map((x) => x.id), ratingOf) }))} />
      )}
      {letters.map((x) => (
        <View key={x} style={{ gap: theme.spacing(1) }}>
          <FieldLabel>{posName(x)}</FieldLabel>
          <View style={st.chips}>
            {roster.map((p) => {
              const r = spec.boards ? ratingOf(p.id) : undefined;
              return <SelectChip key={p.id} label={`${p.fullName}${r ? ` ${r}` : ''}`} active={l.pos[x] === p.id} onPress={() => setPos(x, p.id)} />;
            })}
          </View>
        </View>
      ))}
      {spec.rubbers.map((r, i) => (r.p.length ? null : (
        <View key={i} style={{ gap: theme.spacing(1) }}>
          <FieldLabel hint={rubberSize(r.k) === 2 ? 'Pick two' : undefined}>{`${i + 1}. ${rubberLabel(spec, i)}`}</FieldLabel>
          <View style={st.chips}>
            {roster.map((p) => (
              <SelectChip key={p.id} label={p.fullName} active={(l.pairs[String(i)] ?? []).includes(p.id)} onPress={() => togglePair(i, p.id, rubberSize(r.k))} />
            ))}
          </View>
        </View>
      )))}
      {problems.errors.length ? <Text style={st.problem}>{problems.errors.slice(0, 3).join(' · ')}</Text> : null}
      {problems.warnings.map((w) => <Text key={w} style={st.warn}>⚠️ {w}</Text>)}
      <FormError message={err} />
      <View style={st.rowGap}>
        <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onCancel} />
        <Button label={busy ? 'Saving…' : 'Save lineup'} style={{ flex: 1 }} disabled={busy || problems.errors.length > 0}
          onPress={async () => { setBusy(true); setErr(null); try { await onSave(l); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); } }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  board: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  team: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', flexShrink: 1 },
  win: { fontWeight: '900', color: theme.colors.text },
  right: { textAlign: 'right' },
  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  score: { color: theme.colors.text, fontSize: 30, fontWeight: '800', minWidth: 26, textAlign: 'center' },
  sep: { color: theme.colors.textMuted, fontSize: theme.font.h3 },
  summary: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  champ: { backgroundColor: PODIUM[0] + '1F', borderRadius: theme.radius.md, padding: theme.spacing(3), borderWidth: 1, borderColor: PODIUM[0] + '66' },
  champText: { color: PODIUM[0], fontSize: theme.font.body, fontWeight: '800', textAlign: 'center' },
  card: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing(2) },
  rowGap: { flexDirection: 'row', gap: theme.spacing(2) },
  teamName: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body, flex: 1 },
  pill: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pillOk: { color: theme.colors.primary },
  lineText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  problem: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  rubber: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  rubberLive: { borderColor: theme.colors.danger + '99' },
  rubberOff: { opacity: 0.6 },
  rubberNo: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  status: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  statusLive: { color: theme.colors.danger },
  player: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  rubberScore: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  line: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small },
});
