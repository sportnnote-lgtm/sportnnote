/** SD-77 (CH-06) — the chess wall chart / crosstable under the rank list:
 *  Swiss = one row per player × rounds ("4w1 2b½ bye"), round robin = the
 *  player × player grid; then Pts, the active tie-breaks and (SD-85) Rtg /
 *  ARO / TPR, marked unofficial. The name column stays put and the grid
 *  scrolls sideways, so a 375 px phone never overflows. Tap a player for
 *  their tournament line. */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import type { Match, Player, StatLine } from '../core/types';
import { isNoResultMatch, swissRoundOf, type StandingsConfig, type TeamStanding } from '../data/standings';
import { buildCrosstable, entrantPlayers, playerLine } from '../data/chessCrosstable';
import { chessRatingsOf, ratingListFor, ratingOn, UNOFFICIAL_NOTE } from '../data/chessRatings';

const ROW_H = 34;
const NAME_W = 132;
const CELL_W = 46;
const NUM_W = 50;

export function ChessCrosstable({
  rows, cfg, matches, teams, players, lines, timeControl, swissRounds, onPlayer,
}: {
  rows: TeamStanding[];
  cfg?: StandingsConfig;
  /** this tournament's chess matches (pending games, the entrant → player map) */
  matches: Match[];
  /** entrants with their rosters */
  teams: { id: string; roster?: string[] }[];
  players: Player[];
  lines?: StatLine[];
  /** the event's time control (picks the rating list) */
  timeControl?: unknown;
  swissRounds?: number;
  onPlayer?: (playerId: string | undefined, teamId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const list = ratingListFor(timeControl);
  const x = useMemo(() => {
    if (!cfg || !rows.length) return null;
    const who = entrantPlayers(teams, matches, lines);
    const byId = new Map(players.map((p) => [p.id, p]));
    const ratingOf = (teamId: string) => { const pid = who.get(teamId); return pid ? ratingOn(chessRatingsOf(byId.get(pid)), list) : undefined; };
    const pending = new Set<string>();
    for (const m of matches) {
      const r = swissRoundOf(m.stage);
      if (m.sport !== 'chess' || !r || m.status === 'cancelled') continue;
      if (!(m.status === 'completed' && (!!m.winner || isNoResultMatch(m)))) { pending.add(`${m.homeTeam.id}|${r}`); pending.add(`${m.awayTeam.id}|${r}`); }
    }
    return { table: buildCrosstable({ rows, cfg, ratingOf, pending, rounds: swissRounds }), who };
  }, [rows, cfg, teams, matches, lines, players, list, swissRounds]);
  if (!x || !x.table.rows.some((r) => r.cells.some((c) => c.done && c.kind !== 'self'))) return null;
  const { table, who } = x;
  const heads = [
    ...Array.from({ length: table.cols }, (_, i) => (table.swiss ? `R${i + 1}` : String(i + 1))),
  ];
  const listLabel = list === 'standard' ? 'standard' : list;
  const sel = open ? table.rows.find((r) => r.teamId === open) : undefined;

  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={st.head}>♟️ {table.swiss ? 'Wall chart' : 'Crosstable'}</Text>
      <Card style={st.card}>
        <View style={st.wrap}>
          {/* frozen rank + name column */}
          <View style={{ width: NAME_W }}>
            <View style={[st.row, st.headRow]}><Text style={st.hText}>#  Player</Text></View>
            {table.rows.map((r) => (
              <TouchableOpacity key={r.teamId} accessibilityRole="button" accessibilityLabel={`${r.rank}. ${r.name} — tournament line`}
                onPress={() => setOpen(open === r.teamId ? null : r.teamId)} style={[st.row, open === r.teamId && st.on]}>
                <Text style={st.rank}>{r.rank}</Text>
                <Text style={st.name} numberOfLines={1}>{r.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }} style={{ flex: 1 }}>
            <View>
              <View style={[st.row, st.headRow]}>
                {table.rated && <Text style={[st.hText, st.num]}>Rtg</Text>}
                {heads.map((h) => <Text key={h} style={[st.hText, st.cell]}>{h}</Text>)}
                <Text style={[st.hText, st.num]}>Pts</Text>
                {table.tbHeads.map((h) => <Text key={h.key} style={[st.hText, st.num]} accessibilityLabel={h.title}>{h.label}</Text>)}
                {table.rated && <Text style={[st.hText, st.num]}>ARO</Text>}
                {table.rated && <Text style={[st.hText, st.num]}>TPR*</Text>}
              </View>
              {table.rows.map((r) => (
                <View key={r.teamId} style={[st.row, open === r.teamId && st.on]}>
                  {table.rated && <Text style={[st.cellText, st.num, st.muted]}>{r.rating ?? '–'}</Text>}
                  {r.cells.map((c) => (
                    <Text key={c.col} accessibilityLabel={c.title} style={[st.cellText, st.cell,
                      c.kind === 'self' && st.self, c.kind === 'forfeit' && st.muted, c.kind === 'bye' && st.muted,
                      c.points === 1 && c.kind === 'played' && st.win]}>{c.text}</Text>
                  ))}
                  <Text style={[st.cellText, st.num, st.pts]}>{r.pointsText}</Text>
                  {r.tbs.map((v, i) => <Text key={table.tbHeads[i].key} style={[st.cellText, st.num]}>{v}</Text>)}
                  {table.rated && <Text style={[st.cellText, st.num]}>{r.perf.aro ?? '–'}</Text>}
                  {table.rated && <Text style={[st.cellText, st.num]}>{r.perf.tpr ?? '–'}</Text>}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Card>
      {sel && (
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.body}><Text style={{ fontWeight: '800' }}>{sel.rank}. {sel.name}</Text>{sel.rating ? ` · ${sel.rating} (${listLabel})` : ''}</Text>
          <Text style={textStyles.muted}>{playerLine(table, sel.teamId)}</Text>
          {sel.perf.tpr !== undefined && (
            <Text style={st.note}>TPR over {sel.perf.games} rated game{sel.perf.games === 1 ? '' : 's'} ({sel.perf.score}/{sel.perf.games}) — unofficial, not FIDE-rated.</Text>
          )}
          {onPlayer && (
            <Text style={st.link} accessibilityRole="button" onPress={() => onPlayer(who.get(sel.teamId), sel.teamId)}>Open profile ›</Text>
          )}
        </Card>
      )}
      <Text style={st.note}>
        {table.swiss ? '4w1 = v No. 4 with White, won · b = Black · + / − forfeit won / lost · bye · – absent · … to play. ' : 'Row v column: 1 win · ½ draw · 0 loss · + / − forfeit. '}
        Swipe the grid sideways. Tap a player for their line.
        {table.rated ? ` *Rtg = ${listLabel} rating from profiles. ${UNOFFICIAL_NOTE}` : ''}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  head: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', marginTop: theme.spacing(2) },
  card: { padding: 0, overflow: 'hidden' },
  wrap: { flexDirection: 'row' },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, paddingHorizontal: 4 },
  headRow: { backgroundColor: theme.colors.surfaceAlt },
  on: { backgroundColor: theme.colors.primary + '1f' },
  hText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  rank: { width: 22, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  name: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  cell: { width: CELL_W, textAlign: 'center' },
  num: { width: NUM_W, textAlign: 'center' },
  cellText: { color: theme.colors.text, fontSize: 12 },
  self: { backgroundColor: theme.colors.surfaceAlt, height: ROW_H - 8, borderRadius: 3 },
  muted: { color: theme.colors.textMuted },
  win: { fontWeight: '800' },
  pts: { fontWeight: '900', color: theme.colors.primary },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontWeight: '700' },
});
