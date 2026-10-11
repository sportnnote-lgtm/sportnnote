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
  attemptText, formatMark, summarizeLifts, usesLanes, splitsText, legLabels, liftSeries, bombedOutOf, fmtKg,
  shootEventOf, seriesLine, totalText, archRoundOf, archRowText, isBracketRows, bracketState, bracketFormat, bracketRowText,
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
    // SD-97: "Bw 78.4 · Sn 80 (83) 83 → 83 · C&J 100 105 (108) → 105"; a lift-only table shows that lift
    const l = summarizeLifts(res.lifts);
    const sn = `Sn ${liftSeries(res.lifts?.snatch) || '–'} → ${l.snatch ?? '–'}`, cj = `C&J ${liftSeries(res.lifts?.cj) || '–'} → ${l.cj ?? '–'}`;
    const only = def.lifts?.length === 1 ? def.lifts[0] : undefined;
    const bomb = !only && r.status === 'NM' ? bombedOutOf(res) : null;
    return [res.bodyweight != null ? `Bw ${fmtKg(res.bodyweight)}` : '', only === 'cj' ? '' : sn, only === 'snatch' ? '' : cj, bomb ? `no total — no good ${bomb === 'snatch' ? 'snatch' : 'C&J'}` : ''].filter(Boolean).join(' · ');
  }
  // SD-96 shooting: a finalist's final shots (+ the qualification score), or the series and the ISSF total ("586-24x")
  const shoot = def.tie === 'issf' ? shootEventOf(def.key) : undefined;
  if (shoot) {
    if (Array.isArray(res.fshots)) return [res.fshots.length ? `${res.fshots.length} shot${res.fshots.length === 1 ? '' : 's'}: ${res.fshots.slice(-5).map((v) => v.toFixed(1)).join(' ')}${res.fshots.length > 5 ? ' …' : ''}` : '', res.qual ? `Q ${totalText(res.qual.mark, res.qual.xs, shoot.scoring)}` : ''].filter(Boolean).join(' · ');
    const members = res.members?.length ? res.members.map((m) => m.name).join(' / ') : '';
    const line = seriesLine(res, shoot, (res.series?.length ?? 0) * shoot.seriesOf);
    return [members, line, shoot.scoring === 'integer' && res.xs != null && res.mark != null ? totalText(res.mark, res.xs, 'integer') : ''].filter(Boolean).join(' · ');
  }
  // SD-95 archery: a ranking row's ends / 10s / X (a match-play row's line comes from the bracket — see ResultsSheet)
  const arch = def.sport === 'archery' ? archRoundOf(def.key) : undefined;
  if (arch) return res.mp != null ? (res.seed != null ? `Seed ${res.seed}${res.qual ? ` (${res.qual.mark})` : ''}` : '') : archRowText(res, arch);
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
  // SD-95: archery match play — each archer's matches ("QF W 6–4 · SF L 5–6 (SO 9–10)")
  const allRows = [...heats.values()].flat().map((r) => r.entry);
  const bracket = def.sport === 'archery' && isBracketRows(allRows) ? bracketState(allRows, bracketFormat(def)) : null;
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
            <Text style={[st.name, st.headTxt]}>{def.teamSize ? 'Team' : def.sport === 'swimming' ? 'Swimmer' : def.sport === 'weightlifting' ? 'Lifter' : def.sport === 'shooting' ? 'Shooter' : def.sport === 'archery' ? 'Archer' : 'Athlete'}</Text>
            <Text style={[st.mark, st.headTxt]}>{bracket ? 'Match' : def.unit === 'time' ? 'Time' : def.unit === 'mass' ? (def.lifts?.length === 1 ? 'Best kg' : 'Total kg') : def.unit === 'points' ? 'Score' : 'Mark'}</Text>
          </View>
          {rows.map((r) => {
            const detail = [overall ? `Heat ${r.entry.heat}` : '', bracket ? bracketRowText(r.entry, bracket, allRows) : seriesText(r, def)].filter(Boolean).join(' · ');
            return (
              <View key={r.id} style={st.entry} accessibilityLabel={`${r.label || 'no place yet'}, ${r.entry.name}, ${r.bestText || r.status}`}>
                <View style={st.row}>
                  <Text style={[st.pos, r.position === 1 && st.gold]}>{def.capture === 'lifts' && r.status === 'NM' ? '—' : r.label || '–'}</Text>
                  <Text style={st.lane}>{(lanes ? r.entry.result.lane : r.entry.result.order) ?? ''}</Text>
                  <View style={st.name}>
                    <Text style={st.nameTxt} numberOfLines={1}>{r.entry.name}</Text>
                    {r.entry.team?.name && r.entry.team.name !== r.entry.name ? <Text style={st.team} numberOfLines={1}>{r.entry.team.name}</Text> : null}
                  </View>
                  <View style={st.mark}>
                    <Text style={st.markTxt}>{r.bestText || (def.capture === 'lifts' && r.status === 'NM' ? '—' : r.status !== 'ok' ? r.status : '')}</Text>
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
