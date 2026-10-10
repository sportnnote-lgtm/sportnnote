/** The official results sheet for one phase of a timed / measured event — one
 *  table per heat: place, lane / order, name + team, mark (+ wind), flags
 *  (Q / q, PB, SB, MR, w, h); field events add the attempt series, vertical
 *  jumps the bar progression, relays the team members. Unit- and
 *  discipline-driven, so every SD-90+ sport reuses it unchanged. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, textStyles } from '../ui';
import {
  attemptText, formatMark, summarizeLifts, usesLanes, splitsText, legLabels,
  type DisciplineDef, type RankedEntry, type ResultFlag,
} from '../../data/results';

const FLAG_COLOR: Partial<Record<ResultFlag, string>> = {
  Q: theme.colors.primary, q: theme.colors.primary, MR: theme.colors.accent, '=MR': theme.colors.accent,
  SR: theme.colors.accent, '=SR': theme.colors.accent, PB: theme.colors.home, '=PB': theme.colors.home, SB: theme.colors.home, '=SB': theme.colors.home,
  w: theme.colors.away, h: theme.colors.away, JO: theme.colors.danger, SO: theme.colors.danger,
};

const LEG_SHORT: Record<string, string> = { Backstroke: 'Back', Breaststroke: 'Breast', Butterfly: 'Fly', Freestyle: 'Free' };

export const windText = (w: number | undefined) => (w == null ? '' : `${w > 0 ? '+' : w < 0 ? '−' : ''}${Math.abs(w).toFixed(1)}`);

export function Flags({ flags }: { flags: ResultFlag[] }) {
  if (!flags.length) return null;
  return (
    <View style={st.flags}>
      {flags.map((f) => (
        <Text key={f} style={[st.flag, { color: FLAG_COLOR[f] ?? theme.colors.textMuted, borderColor: (FLAG_COLOR[f] ?? theme.colors.border) + '88' }]}>{f}</Text>
      ))}
    </View>
  );
}

/** The detail line under a name: attempts / bar progression / lifts / relay legs. */
export function seriesText(r: RankedEntry, def: DisciplineDef): string {
  const res = r.entry.result;
  if (def.capture === 'attempts') return (res.attempts ?? []).map((a) => attemptText(a, def) + (def.wind === 'attempt' && a.mark != null && a.wind != null ? ` (${windText(a.wind)})` : '')).filter(Boolean).join('  ');
  if (def.capture === 'heights') return [...(res.heights ?? [])].sort((a, b) => a.height - b.height).filter((h) => h.tries).map((h) => `${formatMark(h.height, def)} ${h.tries}`).join(' · ');
  if (def.capture === 'lifts') {
    const l = summarizeLifts(res.lifts);
    const one = (xs?: { kg: number; good?: boolean }[]) => (xs ?? []).map((a) => (a.good === false ? `(${a.kg})` : String(a.kg))).join(' ');
    return `Sn ${one(res.lifts?.snatch)} → ${l.snatch ?? '–'} · C&J ${one(res.lifts?.cj)} → ${l.cj ?? '–'}`;
  }
  if (def.capture === 'target') return [res.tens != null ? `10s ${res.tens}` : '', res.xs != null ? `X ${res.xs}` : ''].filter(Boolean).join(' · ');
  // SD-94 swimming: medley legs by stroke, then the 50 m splits
  const swim = def.sport === 'swimming';
  const legs = swim ? legLabels(def.key) : [];
  const members = res.members?.length
    ? res.members.slice(0, def.teamSize ?? 4).map((m, i) => (swim && LEG_SHORT[legs[i]] ? `${LEG_SHORT[legs[i]]} ${m.name}` : m.name)).join(', ')
    : '';
  const splits = swim ? splitsText(res.splits, (v) => formatMark(v, def), def.key) : '';
  return [members, splits].filter(Boolean).join(' · ');
}

export function ResultsSheet({ def, title, subtitle, heats, wind, overall }: {
  def: DisciplineDef;
  title: string;
  subtitle?: string;
  /** heat number → ranking (with Q / q / record flags already added) */
  heats: Map<number, RankedEntry[]>;
  /** race wind per heat (track sprints) */
  wind?: Map<number, number | undefined>;
  /** SD-94: a timed final's one overall table (each row shows its heat) */
  overall?: boolean;
}) {
  const lanes = usesLanes(def);
  const many = heats.size > 1;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View>
        <Text style={textStyles.h3}>{title}</Text>
        {subtitle ? <Text style={textStyles.muted}>{subtitle}</Text> : null}
      </View>
      {[...heats].map(([heat, rows]) => (
        <Card key={heat} style={{ gap: theme.spacing(1), padding: theme.spacing(3) }}>
          {(many || overall || (def.wind === 'race' && wind?.get(heat) != null)) && (
            <Text style={st.heatHead}>
              {overall ? 'Overall' : many ? `Heat ${heat}` : 'Result'}{def.wind === 'race' && wind?.get(heat) != null ? `  ·  wind ${windText(wind.get(heat))} m/s` : ''}
            </Text>
          )}
          <View style={[st.row, st.head]}>
            <Text style={[st.pos, st.headTxt]}>Pl</Text>
            <Text style={[st.lane, st.headTxt]}>{lanes ? 'Ln' : '#'}</Text>
            <Text style={[st.name, st.headTxt]}>{def.teamSize ? 'Team' : def.sport === 'swimming' ? 'Swimmer' : 'Athlete'}</Text>
            <Text style={[st.mark, st.headTxt]}>{def.unit === 'time' ? 'Time' : def.unit === 'mass' ? 'Total' : def.unit === 'points' ? 'Score' : 'Mark'}</Text>
          </View>
          {rows.map((r) => {
            const detail = [overall ? `Heat ${r.entry.heat}` : '', seriesText(r, def)].filter(Boolean).join(' · ');
            return (
              <View key={r.id} style={st.entry} accessibilityLabel={`${r.label || 'no place yet'}, ${r.entry.name}, ${r.bestText || r.status}`}>
                <View style={st.row}>
                  <Text style={[st.pos, r.position === 1 && st.gold]}>{r.label || '–'}</Text>
                  <Text style={st.lane}>{(lanes ? r.entry.result.lane : r.entry.result.order) ?? ''}</Text>
                  <View style={st.name}>
                    <Text style={st.nameTxt} numberOfLines={1}>{r.entry.name}</Text>
                    {r.entry.team?.name && r.entry.team.name !== r.entry.name ? <Text style={st.team} numberOfLines={1}>{r.entry.team.name}</Text> : null}
                  </View>
                  <View style={st.mark}>
                    <Text style={st.markTxt}>{r.bestText || (r.status !== 'ok' ? r.status : '')}</Text>
                    {def.wind === 'attempt' && r.wind != null ? <Text style={st.team}>{windText(r.wind)}</Text> : null}
                  </View>
                </View>
                {(detail || r.flags.length || r.entry.result.ruleRef) ? (
                  <View style={st.sub}>
                    <Flags flags={r.flags} />
                    {r.entry.result.ruleRef ? <Text style={st.team}>{r.status} {r.entry.result.ruleRef}{r.entry.result.reason ? ` ${r.entry.result.reason}` : ''}</Text> : null}
                    {detail ? <Text style={st.detail}>{detail}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  heatHead: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', marginBottom: theme.spacing(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  head: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(1) },
  headTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  entry: { paddingVertical: theme.spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, gap: 2 },
  pos: { width: 34, color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  gold: { color: theme.colors.accent },
  lane: { width: 22, color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
  name: { flex: 1, minWidth: 0 },
  nameTxt: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  team: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  mark: { minWidth: 64, alignItems: 'flex-end' },
  markTxt: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2), paddingLeft: 34 + 22 + theme.spacing(4) },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, flexShrink: 1 },
  flags: { flexDirection: 'row', gap: 4 },
  flag: { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
});
