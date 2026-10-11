/**
 * SD-68 (CR-03) — the carrom score sheet, laid out like the ICF referee's
 * sheet: one table per game, a row per board — # · breaker · won by · coins
 * left · Queen · points · running total. Penalty boards (CR-07), slams and
 * tie-break boards are marked; the game result sits on the table's head.
 * Display only: everything comes from `scoreSheet` (engine.ts).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { scoreSheet, type CarromState, type SheetRow, type Side } from './engine';

/** A short tag for a side in a narrow column ("Asha" from "Asha Rao"). */
const tagOf = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 8 ? `${first.slice(0, 7)}…` : first;
};

function queenText(r: SheetRow): string {
  if (!r.queen) return '';
  if (r.queen === 'winner') return r.queenCounted ? '👑 +3' : '👑 0';
  if (r.queen === 'loser') return '👑 L';
  return '–';
}

export function ScoreSheet({ state, homeName, awayName, homeColor, awayColor }: {
  state: CarromState; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
}) {
  const games = scoreSheet(state);
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? hc : ac);
  const toss = state.firstBreak != null;
  const anyQueen = games.some((g) => g.rows.some((r) => r.queen));
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {games.map((g) => (
        <View key={g.game} style={st.card} accessibilityLabel={`Game ${g.game} score sheet`}>
          <Text style={st.title}>
            Game {g.game} · {g.score[0]}-{g.score[1]}{g.done && g.winner ? ` · ${name(g.winner)} won` : ' · in play'}
          </Text>
          <View style={[st.row, st.head]}>
            <Text style={[st.cell, st.n]}>#</Text>
            {toss && <Text style={[st.cell, st.who]}>Break</Text>}
            <Text style={[st.cell, st.who]}>Won by</Text>
            <Text style={[st.cell, st.num]}>Coins</Text>
            {anyQueen && <Text style={[st.cell, st.q]}>Queen</Text>}
            <Text style={[st.cell, st.num]}>Pts</Text>
            <Text style={[st.cell, st.tot]}>{tagOf(homeName)}–{tagOf(awayName)}</Text>
          </View>
          {g.rows.map((r) => (
            <View key={r.n} style={[st.row, r.penalty && st.penRow]}
              accessibilityLabel={`Board ${r.n}: ${name(r.winner)} ${r.penalty ? 'penalty' : ''} +${r.pts}, ${r.total.home}-${r.total.away}`}>
              <Text style={[st.cell, st.n]}>{r.n}{r.tieBreak ? '*' : ''}</Text>
              {toss && <Text style={[st.cell, st.who]} numberOfLines={1}>{r.breaker ? tagOf(name(r.breaker)) : '–'}</Text>}
              <Text style={[st.cell, st.who, { color: color(r.winner), fontWeight: '800' }]} numberOfLines={1}>{tagOf(name(r.winner))}</Text>
              <Text style={[st.cell, st.num]}>{r.penalty ? 'PEN' : r.coins}</Text>
              {anyQueen && <Text style={[st.cell, st.q]}>{queenText(r)}</Text>}
              <Text style={[st.cell, st.num, st.bold]}>+{r.pts}</Text>
              <Text style={[st.cell, st.tot, st.bold]}>{r.total.home}–{r.total.away}{r.slam ? (r.slam === 'white' ? ' ⚪' : ' ⚫') : ''}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={st.key}>
        PEN = penalty board (3 to the opponent, not a board won){anyQueen ? ' · 👑 +3 Queen counted, 0 = covered at 22+, L = covered by the loser' : ''} · ⚪ / ⚫ White / Black slam · * tie-break board
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden' },
  title: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', padding: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  head: { backgroundColor: theme.colors.surfaceAlt },
  penRow: { backgroundColor: theme.colors.accent + '22' },
  cell: { color: theme.colors.text, fontSize: theme.font.small },
  n: { width: 24 },
  who: { flex: 1, minWidth: 0 },
  num: { width: 40, textAlign: 'right' },
  q: { width: 48, marginLeft: 4, textAlign: 'center' },
  tot: { width: 58, textAlign: 'right' },
  bold: { fontWeight: '800' },
  key: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
