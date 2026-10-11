/** SD-93 — combined events: the running standings (after each event, with this
 *  event's points live) and the full results sheet (every event's mark and
 *  points, the total, PB / SB / MR on the total, abandoned athletes as DNF). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, textStyles } from '../ui';
import { Flags } from './ResultsSheet';
import { shortName, combinedDay, type CombinedRow, type CombinedFormat, type ResultFlag } from '../../data/results';

const tieText = (r: CombinedRow) => (r.tieBreak === 'events' ? 'level on points — ahead on events won (TR 39.12)' : r.tieBreak === 'best' ? 'level on points — ahead on the best single event (TR 39.12)' : '');

/** Standings after the events so far; `current` = the index whose points are shown in their own column. */
export function CombinedStandingsCard({ rows, c, current, title, flags }: { rows: CombinedRow[]; c: CombinedFormat; current?: number; title: string; flags?: Map<string, ResultFlag[]> }) {
  const shown = rows.filter((r) => r.done > 0 || r.out || current != null);
  return (
    <Card style={{ gap: theme.spacing(1), padding: theme.spacing(3) }}>
      <Text style={textStyles.h3}>{title}</Text>
      <View style={[st.row, st.head]}>
        <Text style={[st.pos, st.headTxt]}>Pl</Text>
        <Text style={[st.name, st.headTxt]}>Athlete</Text>
        {current != null ? <Text style={[st.num, st.headTxt]}>{shortName(c.events[current])}</Text> : null}
        <Text style={[st.num, st.headTxt]}>Total</Text>
      </View>
      {shown.map((r) => {
        const cell = current != null ? r.cells[current] : undefined;
        const f = flags?.get(r.athleteId) ?? [];
        const note = r.out ? `out after no start in ${shortName(c.events[r.outAt ?? 0])} (TR 39.10)` : tieText(r);
        return (
          <View key={r.athleteId} style={st.entry} accessibilityLabel={`${r.label || 'no place'}, ${r.name}, ${r.out ? 'did not finish' : `${r.total} points`}`}>
            <View style={st.row}>
              <Text style={[st.pos, r.position === 1 && st.gold]}>{r.label || '–'}</Text>
              <View style={st.name}>
                <Text style={st.nameTxt} numberOfLines={1}>{r.name}</Text>
                {r.team?.name ? <Text style={st.small} numberOfLines={1}>{r.team.name}</Text> : null}
              </View>
              {current != null ? <Text style={st.num}>{cell ? (cell.state === 'ok' ? cell.points : cell.state === 'pending' ? '' : cell.text) : ''}</Text> : null}
              <Text style={[st.num, st.total]}>{r.out ? 'DNF' : r.total}</Text>
            </View>
            {(note || f.length) ? (
              <View style={st.sub}>
                <Flags flags={f} />
                {note ? <Text style={st.small}>{note}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {!shown.length ? <Text style={textStyles.muted}>No results yet.</Text> : null}
    </Card>
  );
}

/** The official sheet: each athlete's events (mark and points) and the total. */
export function CombinedSheet({ rows, c, title, subtitle, flags }: { rows: CombinedRow[]; c: CombinedFormat; title: string; subtitle?: string; flags?: Map<string, ResultFlag[]> }) {
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View>
        <Text style={textStyles.h3}>{title}</Text>
        {subtitle ? <Text style={textStyles.muted}>{subtitle}</Text> : null}
      </View>
      <Card style={{ gap: theme.spacing(1), padding: theme.spacing(3) }}>
        {rows.filter((r) => r.done > 0 || r.out).map((r) => (
          <View key={r.athleteId} style={st.entry}>
            <View style={st.row}>
              <Text style={[st.pos, r.position === 1 && st.gold]}>{r.label || '–'}</Text>
              <View style={st.name}>
                <Text style={st.nameTxt} numberOfLines={1}>{r.name}</Text>
                {r.team?.name ? <Text style={st.small} numberOfLines={1}>{r.team.name}</Text> : null}
              </View>
              <Text style={[st.num, st.total]}>{r.out ? 'DNF' : `${r.total}`}</Text>
            </View>
            <View style={st.sub}>
              <Flags flags={flags?.get(r.athleteId) ?? []} />
              {r.complete && !r.legal ? <Text style={st.small}>not record-eligible (wind / hand timing)</Text> : null}
              {tieText(r) ? <Text style={st.small}>{tieText(r)}</Text> : null}
            </View>
            <View style={st.cells}>
              {c.events.map((d, i) => {
                const cell = r.cells[i];
                const day = c.day2 != null && i === c.day2;
                return (
                  <Text key={d} style={[st.cell, day && st.dayCell]} accessibilityLabel={`${shortName(d)} ${cell?.text || 'no result'} ${cell?.state === 'ok' ? `${cell.points} points` : ''}`}>
                    <Text style={st.cellHead}>{shortName(d)} </Text>
                    {cell && cell.state !== 'pending' ? `${cell.text}${cell.wind != null ? ` (${cell.wind > 0 ? '+' : ''}${cell.wind.toFixed(1)})` : ''} · ${cell.state === 'ok' ? cell.points : 0}` : '–'}
                  </Text>
                );
              })}
            </View>
          </View>
        ))}
        {c.day2 != null ? <Text style={st.small}>{combinedDay(c, 0)}: events 1–{c.day2} · {combinedDay(c, c.day2)}: events {c.day2 + 1}–{c.events.length}</Text> : null}
      </Card>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  head: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(1) },
  headTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  entry: { paddingVertical: theme.spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, gap: 2 },
  pos: { width: 34, color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  gold: { color: theme.colors.accent },
  name: { flex: 1, minWidth: 0 },
  nameTxt: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny, flexShrink: 1 },
  num: { minWidth: 52, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  total: { fontWeight: '800', fontSize: theme.font.body },
  sub: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2), paddingLeft: 34 + theme.spacing(2) },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1), paddingLeft: 34 + theme.spacing(2) },
  cell: { color: theme.colors.text, fontSize: theme.font.tiny, backgroundColor: theme.colors.surfaceAlt, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, fontVariant: ['tabular-nums'] },
  dayCell: { borderLeftWidth: 2, borderLeftColor: theme.colors.primary },
  cellHead: { color: theme.colors.textMuted, fontWeight: '700' },
});
