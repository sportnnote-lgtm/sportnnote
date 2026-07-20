/** Positional layouts for the court/net sports (everything except football,
 *  which keeps its bespoke pitch, and cricket, which has no symmetric two-team
 *  formation). Each entry provides a one-side formation template plus a <Court/>
 *  that draws the sport's markings around the shared <CourtMap/>. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../components/CourtMap';
import type { LineupSlot, SportId } from '../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

/* ------------------------------ formations --------------------------------- */
// x: 0(left)→1(right), y: 0(own baseline)→1(net/centre line).

const BASKETBALL: Slot[] = [
  { position: 'PG', x: 0.5, y: 0.12 },
  { position: 'SG', x: 0.2, y: 0.34 },
  { position: 'SF', x: 0.8, y: 0.34 },
  { position: 'PF', x: 0.34, y: 0.52 },
  { position: 'C', x: 0.66, y: 0.54 },
];

const VOLLEYBALL: Slot[] = [
  { position: 'S', x: 0.5, y: 0.1 },
  { position: 'L', x: 0.22, y: 0.16 },
  { position: 'DS', x: 0.78, y: 0.16 },
  { position: 'OH', x: 0.2, y: 0.44 },
  { position: 'MB', x: 0.5, y: 0.48 },
  { position: 'OPP', x: 0.8, y: 0.44 },
];

const KABADDI: Slot[] = [
  { position: 'LC', x: 0.14, y: 0.3 },
  { position: 'RC', x: 0.86, y: 0.3 },
  { position: 'LCv', x: 0.32, y: 0.44 },
  { position: 'RCv', x: 0.68, y: 0.44 },
  { position: 'LIn', x: 0.4, y: 0.16 },
  { position: 'RIn', x: 0.6, y: 0.16 },
  { position: 'C', x: 0.5, y: 0.32 },
];

const BADMINTON: Slot[] = [
  { position: 'Front', x: 0.5, y: 0.42 },
  { position: 'Back', x: 0.5, y: 0.14 },
];

const TENNIS: Slot[] = [
  { position: 'Deuce', x: 0.72, y: 0.22 },
  { position: 'Ad', x: 0.28, y: 0.22 },
];

// Pickleball & padel are doubles-first: one player each side of centre.
const PICKLEBALL: Slot[] = [
  { position: 'L', x: 0.3, y: 0.18 },
  { position: 'R', x: 0.7, y: 0.18 },
];

const PADEL: Slot[] = [
  { position: 'L', x: 0.3, y: 0.2 },
  { position: 'R', x: 0.7, y: 0.2 },
];

/* ------------------------------- markings ---------------------------------- */

const Net = () => <View style={m.net} />;

function BasketballMarks() {
  return (
    <>
      <Net />
      <View style={m.centreCircle} />
      <View style={[m.key, m.keyTop]} />
      <View style={[m.key, m.keyBottom]} />
      <View style={[m.arc, m.arcTop]} />
      <View style={[m.arc, m.arcBottom]} />
    </>
  );
}

function VolleyballMarks() {
  return (
    <>
      <View style={m.netBand} />
      <View style={[m.attackLine, { top: '32%' }]} />
      <View style={[m.attackLine, { bottom: '32%' }]} />
    </>
  );
}

function KabaddiMarks() {
  return (
    <>
      <Net />
      <View style={[m.baulk, { top: '30%' }]} />
      <View style={[m.baulk, { bottom: '30%' }]} />
    </>
  );
}

function RacketMarks() {
  return (
    <>
      <View style={m.netBand} />
      <View style={m.singlesL} />
      <View style={m.singlesR} />
      <View style={[m.service, { top: '28%' }]} />
      <View style={[m.service, { bottom: '28%' }]} />
      <View style={m.centreServe} />
    </>
  );
}

// Pickleball: a net plus the non-volley "kitchen" line ~7ft from the net each side.
function PickleballMarks() {
  return (
    <>
      <View style={m.netBand} />
      <View style={[m.baulk, { top: '36%' }]} />
      <View style={[m.baulk, { bottom: '36%' }]} />
      <View style={m.centreServe} />
    </>
  );
}

/* ------------------------------ court table -------------------------------- */

const COURTS: Partial<
  Record<SportId, { formation: Slot[]; surface: string; aspectRatio: number; marks: React.FC }>
> = {
  basketball: { formation: BASKETBALL, surface: '#7a4a22', aspectRatio: 0.62, marks: BasketballMarks },
  volleyball: { formation: VOLLEYBALL, surface: '#234e9c', aspectRatio: 0.7, marks: VolleyballMarks },
  kabaddi: { formation: KABADDI, surface: '#5b6b2e', aspectRatio: 0.78, marks: KabaddiMarks },
  badminton: { formation: BADMINTON, surface: '#1f6f4a', aspectRatio: 0.62, marks: RacketMarks },
  tennis: { formation: TENNIS, surface: '#2b6a8c', aspectRatio: 0.62, marks: RacketMarks },
  pickleball: { formation: PICKLEBALL, surface: '#16607a', aspectRatio: 0.66, marks: PickleballMarks },
  padel: { formation: PADEL, surface: '#2e7d5b', aspectRatio: 0.62, marks: RacketMarks },
  // squash has no symmetric two-side court layout (both players share one box).
};

/** Whether a sport has a positional layout (so the lineup editor offers it). */
export function hasCourt(sport: SportId): boolean {
  return sport in COURTS;
}

/** Fresh, unfilled one-side formation for a sport (empty array if it has none). */
export function courtFormation(sport: SportId): LineupSlot[] {
  return (COURTS[sport]?.formation ?? []).map((s) => ({ ...s }));
}

/** The sport's <Court/> renderer, or null if the sport has no layout. */
export function makeCourt(sport: SportId): React.FC<CourtProps> | undefined {
  const cfg = COURTS[sport];
  if (!cfg) return undefined;
  const Marks = cfg.marks;
  const Court: React.FC<CourtProps> = (props) => (
    <CourtMap {...props} surfaceColor={cfg.surface} aspectRatio={cfg.aspectRatio}>
      <Marks />
    </CourtMap>
  );
  return Court;
}

const m = StyleSheet.create({
  net: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  netBand: { position: 'absolute', top: '49.5%', left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  centreCircle: {
    position: 'absolute', top: '50%', left: '50%', width: 56, height: 56, borderRadius: 28,
    borderWidth: 1, borderColor: COURT_LINE, marginLeft: -28, marginTop: -28,
  },
  key: { position: 'absolute', left: '32%', width: '36%', height: '18%', borderWidth: 1, borderColor: COURT_LINE },
  keyTop: { top: 0, borderTopWidth: 0 },
  keyBottom: { bottom: 0, borderBottomWidth: 0 },
  arc: {
    position: 'absolute', left: '15%', width: '70%', height: '24%', borderWidth: 1, borderColor: COURT_LINE,
    borderTopLeftRadius: 80, borderTopRightRadius: 80,
  },
  arcTop: { top: '-6%', transform: [{ rotate: '180deg' }] },
  arcBottom: { bottom: '-6%' },
  attackLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  baulk: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  singlesL: { position: 'absolute', top: 0, bottom: 0, left: '12%', width: 1, backgroundColor: COURT_LINE },
  singlesR: { position: 'absolute', top: 0, bottom: 0, right: '12%', width: 1, backgroundColor: COURT_LINE },
  service: { position: 'absolute', left: '12%', right: '12%', height: 1, backgroundColor: COURT_LINE },
  centreServe: { position: 'absolute', top: '28%', bottom: '28%', left: '50%', width: 1, backgroundColor: COURT_LINE },
});
