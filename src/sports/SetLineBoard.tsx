/**
 * SD-20 — the LineScoreboard for any set/game sport, fed by `plugin.lineScore`:
 * rows = sides, a column per set/game with the one in play highlighted, tennis /
 * padel tiebreaks as superscripts (7 / 6⁴) and a match tiebreak as its own "TB"
 * column (10 / 7). Live, the lead column is the sport's choice (tennis POINTS,
 * rally GAMES); once over — or closed by hand ("ret.") — it reads SETS/GAMES and
 * the winner's row gets the trophy. The grid itself is the pure `lineGrid`.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { LineScoreboard } from '../components/LineScoreboard';
import { lineGrid, MARK_WORD, type LineScore } from './scoreline';
import type { ScoreboardProps } from './types';

export function SetLineBoard({
  ls, homeName, awayName, homeColor, awayColor, live, closed, status, leadLabel, lead, serving, serveIcon = '•', bestOf, alerts,
}: Omit<ScoreboardProps, 'state'> & {
  ls: LineScore | null;
  /** live status line ("Set 2 · Tiebreak") — "Match Over" is added once it ends */
  status: string;
  /** live lead column (tennis/padel POINTS); default = sets/games won */
  leadLabel?: string;
  lead?: { home: string; away: string };
  /** the serving side, while live — a dot after its name */
  serving?: 'home' | 'away' | null;
  serveIcon?: string;
  /** "best of 3" — appended to the status */
  bestOf?: string;
  /** SD-115 — "MATCH POINT · Nadal" chips (pointStatus.ts), while live */
  alerts?: Array<{ side: 'home' | 'away'; text: string }>;
}) {
  if (!ls) return null;
  const final = ls.ended || !!closed;
  const grid = lineGrid(ls, closed ? { closed: { winner: closed.winner ?? null } } : {});
  const wonLabel = ls.unit === 'set' ? 'SETS' : 'GAMES';
  const leadOf = (side: 'home' | 'away') => (final || !lead ? String(ls.won[side]) : lead[side]);
  const name = (side: 'home' | 'away', n: string) => (!final && serving === side ? `${n} ${serveIcon}` : n);
  const mark = closed?.mark ? MARK_WORD[closed.mark] ?? closed.mark : '';
  const head = final ? `Match Over${mark ? ` · ${mark}` : ''}` : status;
  const board = (
    <LineScoreboard
      status={bestOf ? `${head} · ${bestOf}` : head}
      live={live && !final}
      leadLabel={final ? wonLabel : leadLabel ?? wonLabel}
      columns={grid.columns}
      winner={grid.winner}
      home={{ name: name('home', homeName), color: homeColor ?? theme.colors.home, lead: leadOf('home'), cells: grid.home }}
      away={{ name: name('away', awayName), color: awayColor ?? theme.colors.away, lead: leadOf('away'), cells: grid.away }}
    />
  );
  if (final || !alerts?.length) return board;
  // SD-115 — the next point decides something: say so in the side's colour.
  return (
    <View style={st.wrap}>
      {board}
      <View style={st.alerts} accessibilityLiveRegion="polite">
        {alerts.map((a) => {
          const bg = (a.side === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
          return (
            <View key={a.side} style={[st.chip, { borderColor: bg }]}>
              <View style={[st.dot, { backgroundColor: bg }]} />
              <Text style={st.chipText} numberOfLines={1}>{a.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  alerts: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), maxWidth: '100%',
    borderWidth: 2, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.5, flexShrink: 1 },
});
