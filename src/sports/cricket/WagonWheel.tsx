/**
 * SD-133 (CK-11) — the wagon wheel: a tappable field for the scorer (8 zones ×
 * in the ring / deep) and the batter's wheel for the scorecard and profile.
 * The field is drawn from behind the batter, bowler at the top; a right-
 * hander's off side is on the right (a left-hander's picture is mirrored).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { theme } from '../../core/theme';
import type { ShotRec } from './engine';
import { mirrorZone, zoneName, zoneAngle, shotEnd, sideSplit } from './wagon';

const SIZE = 232;
const C = SIZE / 2;
const R = SIZE / 2 - 4;
const RING = 0.55; // the 30-yard circle, as a fraction of the radius

const pt = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(C + Math.sin(a) * r).toFixed(2)} ${(C - Math.cos(a) * r).toFixed(2)}`;
};
/** A ring segment of zone `z` (screen frame) between radii r0 < r1. */
function wedge(z: number, r0: number, r1: number): string {
  const a0 = (z - 1) * 45;
  const a1 = z * 45;
  if (r0 <= 0) return `M ${C} ${C} L ${pt(a0, r1)} A ${r1} ${r1} 0 0 1 ${pt(a1, r1)} Z`;
  return `M ${pt(a0, r1)} A ${r1} ${r1} 0 0 1 ${pt(a1, r1)} L ${pt(a1, r0)} A ${r0} ${r0} 0 0 0 ${pt(a0, r0)} Z`;
}

const GRASS = '#2f7d3a';
const GRASS_IN = '#3a8f46';
const PICK = '#f5c518';

/** The scorer's tap target. `selected` / `onPick` use SCREEN zones; the caller
 *  mirrors for a left-hander when it stores the shot. */
export function WagonField({ lh, selected, onPick }: {
  lh?: boolean;
  selected?: { zone: number; deep: boolean } | null;
  onPick: (screenZone: number, deep: boolean) => void;
}) {
  return (
    <View style={st.wrap} accessibilityLabel={`Field: tap where the shot went${lh ? ' (left-hander)' : ''}`}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((z) => {
          const deepOn = selected?.zone === z && selected.deep;
          const inOn = selected?.zone === z && !selected.deep;
          return (
            <G key={z}>
              <Path d={wedge(z, R * RING, R)} fill={deepOn ? PICK : GRASS} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={1}
                onPress={() => onPick(z, true)} accessibilityLabel={`${zoneName(z, lh)}, deep`} />
              <Path d={wedge(z, 0, R * RING)} fill={inOn ? PICK : GRASS_IN} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={1}
                onPress={() => onPick(z, false)} accessibilityLabel={`${zoneName(z, lh)}, in the ring`} />
            </G>
          );
        })}
        <Circle cx={C} cy={C} r={R * RING} fill="none" stroke="#ffffff" strokeDasharray="4 4" strokeWidth={1} />
        <Rect x={C - 5} y={C - 34} width={10} height={36} fill="#d8c48a" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map((z) => {
          const a = ((z - 0.5) * 45 * Math.PI) / 180;
          return (
            <SvgText key={`t${z}`} x={C + Math.sin(a) * R * 0.78} y={C - Math.cos(a) * R * 0.78 + 4} fontSize={10} fontWeight="700"
              fill="#ffffff" textAnchor="middle">{zoneName(z, lh)}</SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const lineColor = (runs: number) => (runs === 6 ? '#8e44ad' : runs === 4 ? '#1e88e5' : runs >= 2 ? '#f5c518' : '#ffffff');

/** A batter's wagon wheel: one line per tagged shot (drawn in each shot's own
 *  frame — `lh` shots are mirrored back), runs per zone around the rope. */
export function WagonWheelView({ shots, title, note, lh, career }: {
  shots: Pick<ShotRec, 'zone' | 'deep' | 'runs' | 'lh'>[];
  title?: string;
  /** e.g. "12 of 15 scoring shots tagged" */
  note?: string;
  /** career view: mirror the whole picture for a left-hander */
  lh?: boolean;
  /** career totals per zone (one spoke each) — no 4s / 6s legend */
  career?: boolean;
}) {
  const withZone = shots.filter((x) => x.zone);
  const screenZone = (x: Pick<ShotRec, 'zone' | 'lh'>) => (x.lh || lh ? mirrorZone(x.zone!) : x.zone!);
  const perZone = [0, 0, 0, 0, 0, 0, 0, 0];
  const stored = [0, 0, 0, 0, 0, 0, 0, 0];
  const seen = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const x of withZone) { perZone[screenZone(x) - 1] += x.runs; stored[x.zone! - 1] += x.runs; }
  const split = sideSplit(stored);
  const fours = withZone.filter((x) => x.runs === 4).length;
  const sixes = withZone.filter((x) => x.runs === 6).length;
  return (
    <View style={st.card}>
      {title ? <Text style={st.title}>{title}</Text> : null}
      <View style={st.wrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} accessibilityLabel={`Wagon wheel${title ? `: ${title}` : ''}`}>
          <Circle cx={C} cy={C} r={R} fill={GRASS} />
          <Circle cx={C} cy={C} r={R * RING} fill={GRASS_IN} stroke="#ffffff" strokeDasharray="4 4" strokeWidth={1} />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((z) => (
            <Line key={`l${z}`} x1={C} y1={C} x2={C + Math.sin(((z - 1) * 45 * Math.PI) / 180) * R} y2={C - Math.cos(((z - 1) * 45 * Math.PI) / 180) * R}
              stroke="#ffffff" strokeOpacity={0.15} strokeWidth={1} />
          ))}
          <Rect x={C - 5} y={C - 34} width={10} height={36} fill="#d8c48a" />
          {withZone.map((x, i) => {
            const z = screenZone(x);
            if (career) {
              // one spoke per zone, its length by the zone's share of the runs
              const top = Math.max(1, ...perZone);
              const len = 0.3 + 0.62 * (perZone[z - 1] / top);
              const ang = (zoneAngle(z) * Math.PI) / 180;
              return <Line key={i} x1={C} y1={C} x2={C + Math.sin(ang) * len * R} y2={C - Math.cos(ang) * len * R} stroke={PICK} strokeWidth={4} strokeLinecap="round" />;
            }
            const e = shotEnd({ zone: z, deep: x.deep, runs: x.runs }, seen[z - 1]++);
            return <Line key={i} x1={C} y1={C} x2={C + e.x * R} y2={C + e.y * R} stroke={lineColor(x.runs)} strokeWidth={x.runs >= 4 ? 2.5 : 1.5} strokeLinecap="round" />;
          })}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((z) => {
            const a = ((z - 0.5) * 45 * Math.PI) / 180;
            return perZone[z - 1] > 0 ? (
              <SvgText key={`r${z}`} x={C + Math.sin(a) * R * 0.86} y={C - Math.cos(a) * R * 0.86 + 4} fontSize={11} fontWeight="700" fill="#ffffff" textAnchor="middle">
                {perZone[z - 1]}
              </SvgText>
            ) : null;
          })}
        </Svg>
      </View>
      <Text style={st.legend}>
        {career ? null : <><Text style={{ color: '#1e88e5' }}>━ 4s {fours}</Text>   <Text style={{ color: '#8e44ad' }}>━ 6s {sixes}</Text>   </>}
        {split ? `Off side ${split.off}% · leg side ${split.leg}%` : ''}
      </Text>
      {note ? <Text style={st.note}>{note}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: { gap: theme.spacing(1), alignItems: 'stretch' },
  title: { color: theme.colors.text, fontWeight: '700', fontSize: theme.font.body },
  legend: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
});
