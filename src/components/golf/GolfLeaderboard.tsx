/** Golf leaderboard: position (T3), player, total (to-par or Stableford points),
 *  thru ("F" when the round's card is complete, "–" before tee-off), today, the
 *  R1–R4 rounds of a multi-round event and the total strokes (SD-42). Tap a row
 *  to expand that player's card hole by hole; an organiser long-presses a row
 *  for the entry admin (SD-35). Players who missed the cut sit below a "cut"
 *  line, labelled MC, with their total so far; WD / DQ / DNS show the
 *  organiser's reason. On a phone the numbers scroll sideways. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { GolfScorecard } from './GolfScorecard';
import { theme } from '../../core/theme';
import { textStyles } from '../ui';
import { toParLabel, roundStats, cardHasDetail, type GolfCard, type Hole, type RankRow, type GolfScoring } from '../../sports/golf/engine';
import { thruLabel, type RoundCell } from '../../data/golfLeaderboard';

export interface LeaderboardCard { holes: Hole[]; card: GolfCard; received: number[] }

export function GolfLeaderboard({
  rows, scoring, nameOf, cards, holesInRound, cutAfter, emptyLabel = 'No scores yet.', roundCols, onLongPressRow, cardTitle, onShareCard,
}: {
  rows: RankRow[];
  scoring: GolfScoring;
  nameOf: (playerId: string) => string;
  /** a card per player (the latest round, or the round picked), for the expandable detail */
  cards?: Map<string, LeaderboardCard>;
  /** holes in the current round — "F" once a player has completed them */
  holesInRound?: number;
  /** draw a cut line below this position (multi-round events) */
  cutAfter?: number;
  emptyLabel?: string;
  /** SD-42 — each player's rounds (data/golfLeaderboard roundCells) */
  roundCols?: { rounds: number[]; byPlayer: Map<string, (RoundCell | null)[]> };
  /** SD-35 — organiser: long-press a row for the entry admin */
  onLongPressRow?: (playerId: string) => void;
  /** a heading over the expanded card ("Round 2 card") */
  cardTitle?: string;
  /** SD-88 — share a player's card */
  onShareCard?: (playerId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <Text style={textStyles.muted}>{emptyLabel}</Text>;
  const fmt = (n: number) => (scoring === 'stableford' ? `${n} pts` : toParLabel(n));
  const multi = (roundCols?.rounds.length ?? 0) > 1;
  const nRounds = roundCols?.rounds.length ?? 0;
  return (
    <View style={st.table}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.scroll}>
        <View style={st.inner}>
          <View style={[st.row, st.head]}>
            <Text style={[st.pos, st.headTxt]}>Pos</Text>
            <Text style={[st.name, st.headTxt]}>Player</Text>
            <Text style={[st.num, st.headTxt]}>{scoring === 'stableford' ? 'Pts' : 'Total'}</Text>
            <Text style={[st.thru, st.headTxt]}>Thru</Text>
            {multi && <Text style={[st.num, st.headTxt]}>Today</Text>}
            {multi && roundCols!.rounds.map((rn) => <Text key={rn} style={[st.rnd, st.headTxt]}>R{rn}</Text>)}
            <Text style={[st.strokes, st.headTxt]} accessibilityLabel="Total strokes">Strk</Text>
          </View>
          {rows.map((r, i) => {
            const c = cards?.get(r.id);
            const cells = roundCols?.byPlayer.get(r.id);
            const current = cells ? cells[nRounds - 1] : undefined;
            // SD-42 — "F" / thru N / "–" before tee-off (cells when known)
            const thru = r.missedCut || (r.position == null && !r.missedCut) ? '–' : current !== undefined ? thruLabel(current)
              : r.thru === 0 ? '–' : holesInRound && r.thru >= holesInRound ? 'F' : String(r.thru);
            const started = r.thru > 0;
            const showCut = cutAfter != null && r.position != null && i > 0 && (rows[i - 1].position ?? 0) <= cutAfter && r.position > cutAfter;
            const out = r.position == null && !r.missedCut;
            const sub = r.playoff === 'pending' ? 'Playoff pending' : r.playoff === 'won' ? 'Won the playoff' : r.playoff === 'lost' ? 'Lost the playoff'
              : out && r.note ? `${r.positionLabel} — ${r.note}` : out && r.status === 'wd' && started ? 'WD — no score' : null;
            return (
              <View key={r.id}>
                {showCut && <Text style={st.cut}>— projected cut —</Text>}
                {r.missedCut && !rows[i - 1]?.missedCut && <Text style={st.cut}>— cut —</Text>}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${nameOf(r.id)}, ${r.positionLabel}, ${out ? 'no score' : fmt(r.total)}${sub ? `, ${sub}` : ''}`}
                  accessibilityHint={onLongPressRow ? 'Tap for the card; long-press for withdraw, disqualify, handicap or remove' : 'Tap for the card'}
                  activeOpacity={0.8}
                  onPress={() => setOpen(open === r.id ? null : r.id)}
                  onLongPress={onLongPressRow ? () => onLongPressRow(r.id) : undefined}
                  delayLongPress={450}
                >
                  <View style={st.row}>
                    <Text style={[st.pos, out && st.outPos]}>{r.positionLabel}</Text>
                    <View style={st.name}>
                      <Text style={textStyles.body} numberOfLines={1}>{nameOf(r.id)}</Text>
                      {sub ? <Text style={[st.sub, r.playoff === 'pending' && st.subWarn]} numberOfLines={1}>{sub}</Text> : null}
                    </View>
                    <Text style={[st.num, st.total, r.position === 1 && st.leader, r.missedCut && st.mcTotal]}>{out || (!started && r.grossTotal === 0 && !r.missedCut) ? '–' : fmt(r.total)}</Text>
                    <Text style={st.thru}>{thru}</Text>
                    {multi && <Text style={st.num}>{out || r.missedCut || !started ? '–' : fmt(r.today)}</Text>}
                    {multi && roundCols!.rounds.map((rn, ri) => {
                      const cell = cells?.[ri];
                      // a round's strokes once it's complete; its to-par while it's being played
                      const v = !cell || cell.thru === 0 ? '–' : cell.noReturn ? 'NR' : cell.thru >= cell.holes ? String(cell.gross) : toParLabel(cell.toPar);
                      return <Text key={rn} style={[st.rnd, cell && cell.thru > 0 && cell.thru < cell.holes && st.rndLive]}>{v}</Text>;
                    })}
                    <Text style={st.strokes}>{r.grossTotal > 0 && !out ? String(r.grossTotal) : '–'}</Text>
                  </View>
                </TouchableOpacity>
                {open === r.id && c && (
                  <View style={st.detailWrap}>
                    {cardTitle ? <Text style={st.cardTitle}>{cardTitle}</Text> : null}
                    <CardDetail {...c} name={nameOf(r.id)} stableford={scoring === 'stableford'} onShare={onShareCard ? () => onShareCard(r.id) : undefined} />
                  </View>
                )}
                {open === r.id && !c && cards && <Text style={[textStyles.muted, st.noCard]}>Not in this round.</Text>}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** SD-45 — one line of the round's stats under a card: putts, GIR, fairways
 *  and, on a card kept with the stats row, scrambling, sand saves and putts
 *  per GIR. Nothing tracked → nothing shown. */
export function cardStatsLine({ holes, card, received }: LeaderboardCard): string {
  const s = roundStats(card, holes, received);
  const parts: string[] = [];
  if (s.puttHoles) parts.push(`${s.putts} putts`);
  if (s.girHoles) parts.push(`GIR ${s.girHit}/${s.girHoles}`);
  if (s.firHoles) parts.push(`FW ${s.firHit}/${s.firHoles}${cardHasDetail(card) && (s.firLeft || s.firRight) ? ` (L${s.firLeft} R${s.firRight})` : ''}`);
  if (cardHasDetail(card)) {
    if (s.scrambleHoles) parts.push(`scrambling ${s.scrambles}/${s.scrambleHoles}`);
    if (s.sandHoles) parts.push(`sand saves ${s.sandSaves}/${s.sandHoles}`);
    if (s.girPutted) parts.push(`${(s.puttsGir / s.girPutted).toFixed(2)} putts/GIR`);
  }
  if (s.penalties) parts.push(`${s.penalties} penalty ${s.penalties === 1 ? 'stroke' : 'strokes'}`);
  return parts.join(' · ');
}

/** SD-88 — the player's card as a proper scorecard (Out / In / Tot, par and
 *  SI rows, birdie ◯ / bogey □ shapes, net / points / putts rows). Sized to
 *  the screen so it scrolls inside its own box, not the leaderboard's. */
export function CardDetail({ holes, card, received, name = 'Score', stableford = false, onShare }: LeaderboardCard & { name?: string; stableford?: boolean; onShare?: () => void }) {
  const line = cardStatsLine({ holes, card, received });
  const { width } = useWindowDimensions();
  return (
    <View style={[st.detail, { width: Math.min(width - theme.spacing(8) - 2, 760) }]}>
      <GolfScorecard holes={holes} players={[{ name, card, received }]} stableford={stableford} onShare={onShare} />
      {line ? <Text style={st.statsLine}>{line}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  table: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  scroll: { flexGrow: 1 },
  inner: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing(2) },
  head: { borderTopWidth: 0, backgroundColor: theme.colors.surfaceAlt },
  headTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  pos: { width: 32, color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  outPos: { color: theme.colors.textMuted },
  name: { flex: 1, minWidth: 108 },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
  subWarn: { color: theme.colors.accent, fontWeight: '800' },
  num: { width: 48, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small },
  thru: { width: 34, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small },
  rnd: { width: 34, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small },
  rndLive: { color: theme.colors.text, fontWeight: '700' },
  strokes: { width: 38, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small },
  total: { fontWeight: '800' },
  leader: { color: theme.colors.primary },
  mcTotal: { fontWeight: '600', color: theme.colors.textMuted },
  cut: { textAlign: 'center', color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '800', paddingVertical: 2 },
  detailWrap: { backgroundColor: theme.colors.surfaceAlt },
  cardTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', paddingHorizontal: theme.spacing(3), paddingTop: theme.spacing(2) },
  detail: { padding: theme.spacing(2), gap: theme.spacing(2) },
  statsLine: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  noCard: { paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2) },
});
