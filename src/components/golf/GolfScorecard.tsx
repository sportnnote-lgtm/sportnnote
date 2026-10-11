/** SD-88 (GF-11) — the classic golf scorecard: hole, par and stroke-index
 *  rows; each player's strokes with ◯ birdie / ◎ eagle / □ bogey / ▣ double+
 *  shapes and ● for a handicap shot; Out / In / Tot columns; net, Stableford
 *  points and putts rows when they apply. It scrolls sideways inside its own
 *  box, so the page never overflows on a 375 px phone. */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../core/theme';
import { cardColumns, cardRows, scoreShape, sumOver, type CardColumn, type ScoreShape } from '../../sports/golf/scorecard';
import type { GolfCard, Hole } from '../../sports/golf/engine';

export interface ScorecardPlayer { name: string; card: GolfCard; received: number[] }

const CELL = 30;
const SUB = 36;
const LABEL = 64;

export function GolfScorecard({ holes, players, stableford = false, onShare }: {
  holes: Hole[];
  players: ScorecardPlayer[];
  /** show the Stableford points row */
  stableford?: boolean;
  /** a Share button under the card */
  onShare?: () => void;
}) {
  const cols = cardColumns(holes);
  const w = (c: CardColumn) => (c.kind === 'hole' ? CELL : SUB);
  const row = (label: string, cell: (c: CardColumn) => React.ReactNode, style?: object, key?: string) => (
    <View key={key ?? label} style={[st.row, style]}>
      <Text style={st.label} numberOfLines={1}>{label}</Text>
      {cols.map((c) => (
        <View key={c.label} style={[st.cell, { width: w(c) }, c.kind !== 'hole' && st.subCell]}>{cell(c)}</View>
      ))}
    </View>
  );
  const num = (v: number | null | undefined, bold = false) => <Text style={[st.txt, bold && st.bold]}>{v == null ? '' : v}</Text>;
  const anyShots = players.some((p) => p.received.some((r) => r !== 0));
  return (
    <View style={st.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={st.scroll}>
        <View>
          {row('Hole', (c) => <Text style={[st.txt, st.head]}>{c.label}</Text>, st.headRow)}
          {row('Par', (c) => num(c.kind === 'hole' ? holes[c.idx[0]].par : sumOver(holes.map((h) => h.par), c.idx), c.kind !== 'hole'))}
          {row('SI', (c) => <Text style={st.muted}>{c.kind === 'hole' ? holes[c.idx[0]].si : ''}</Text>)}
          {players.map((p, pi) => {
            const r = cardRows(holes, p.card, p.received);
            const gross = r.strokes.map((s) => (typeof s === 'number' ? s : null));
            const shots = r.received.some((x) => x !== 0);
            return (
              <View key={pi} style={st.player}>
                {row(p.name, (c) => {
                  if (c.kind !== 'hole') return <Text style={[st.txt, st.bold]}>{sumOver(gross, c.idx) ?? ''}{c.kind === 'total' && r.pickedUp ? '*' : ''}</Text>;
                  const i = c.idx[0];
                  const s = r.strokes[i];
                  return <Score value={s} shape={scoreShape(s, r.par[i])} shot={r.received[i]} />;
                }, undefined, `p${pi}`)}
                {shots && row('Net', (c) => num(c.kind === 'hole' ? r.net[c.idx[0]] : sumOver(r.net, c.idx), c.kind !== 'hole'), st.subRow, `n${pi}`)}
                {stableford && row('Pts', (c) => num(c.kind === 'hole' ? r.points[c.idx[0]] : sumOver(r.points, c.idx), c.kind !== 'hole'), st.subRow, `s${pi}`)}
                {r.putts && row('Putts', (c) => num(c.kind === 'hole' ? r.putts![c.idx[0]] : sumOver(r.putts!, c.idx), c.kind !== 'hole'), st.subRow, `u${pi}`)}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={st.foot}>
        <Text style={st.legend}>◯ birdie · ◎ eagle · □ bogey · ▣ double+{anyShots ? ' · ● shot received' : ''}{players.some((p) => p.card.strokes.includes('P')) ? ' · P picked up (* no return)' : ''}</Text>
        {onShare ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share this card" onPress={onShare} hitSlop={8}>
            <Text style={st.share}>Share card</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function Score({ value, shape, shot }: { value: GolfCard['strokes'][number]; shape: ScoreShape | null; shot: number }) {
  const label = value == null ? '' : String(value);
  const under = shape === 'eagle' || shape === 'birdie';
  const over = shape === 'bogey' || shape === 'double';
  const inner = (
    <View style={[st.mark, under && st.circle, over && st.square, under && st.underBorder, over && st.overBorder]}>
      <Text style={[st.txt, st.bold, under && st.under, over && st.over]}>{label}</Text>
    </View>
  );
  const doubled = shape === 'eagle' || shape === 'double';
  return (
    <View style={st.scoreBox} accessibilityLabel={`${label || 'not played'}${shape && shape !== 'par' ? ` ${shape}` : ''}${shot > 0 ? `, ${shot} shot` : ''}`}>
      {doubled ? <View style={[st.outer, shape === 'eagle' ? st.circle : st.square, under ? st.underBorder : st.overBorder]}>{inner}</View> : inner}
      {shot > 0 ? <Text style={st.dot}>{'●'.repeat(Math.min(shot, 2))}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  scroll: { paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border, minHeight: 28 },
  headRow: { borderTopWidth: 0, backgroundColor: theme.colors.surfaceAlt },
  subRow: { minHeight: 22 },
  player: { borderTopWidth: 1, borderTopColor: theme.colors.text },
  label: { width: LABEL, paddingHorizontal: 6, color: theme.colors.text, fontSize: theme.font.tiny, fontWeight: '800' },
  cell: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  subCell: { backgroundColor: theme.colors.surfaceAlt },
  txt: { color: theme.colors.text, fontSize: theme.font.small },
  head: { fontWeight: '800', color: theme.colors.textMuted, fontSize: theme.font.tiny },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  bold: { fontWeight: '800' },
  scoreBox: { alignItems: 'center', paddingVertical: 2 },
  mark: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  outer: { padding: 1.5, borderWidth: 1.5 },
  circle: { borderRadius: 13 },
  square: { borderRadius: 2 },
  underBorder: { borderColor: theme.colors.primary },
  overBorder: { borderColor: theme.colors.accent },
  under: { color: theme.colors.primary },
  over: { color: theme.colors.accent },
  dot: { color: theme.colors.textMuted, fontSize: 7, lineHeight: 8 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  legend: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny },
  share: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
});
