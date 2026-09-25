/**
 * Rich lineups view (FIFA-style): both XIs on one vertical pitch with player
 * avatars (photo or monogram), jersey number + name, and per-player markers —
 * a yellow/red card and a "subbed off (min)" arrow. Below the pitch: each side's
 * bench (subs who came on show their minute), the formation labels and a legend.
 *
 * Pure presentation — it reads the match's lineups, the matchday squads (for the
 * bench + jersey numbers) and the timeline events (for cards & substitutions).
 */
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import type { LineupSlot, Player } from '../../core/types';
import type { FootballEvent } from './events';

const DEF = new Set(['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'SW']);
const FWD = new Set(['ST', 'CF', 'LW', 'RW', 'SS']);

/** Derive a formation label (e.g. 4-3-3) from the outfield position groups. */
function formationLabel(lineup: LineupSlot[]): string {
  const filled = lineup.filter((s) => s.playerId || s.position);
  let d = 0, m = 0, f = 0;
  for (const s of filled) {
    if (s.position === 'GK') continue;
    if (DEF.has(s.position)) d++;
    else if (FWD.has(s.position)) f++;
    else m++;
  }
  return d + m + f > 0 ? `${d}-${m}-${f}` : '—';
}

const initials = (name?: string, position?: string) =>
  name ? name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : position ?? '';

interface Marks { card?: 'yellow' | 'red' | 'two-yellow'; subOff?: number; goals?: number; }
/** Map each player (by name) to their card + sub-off markers from the timeline. */
function deriveMarks(events: FootballEvent[]): Record<string, Marks> {
  const out: Record<string, Marks> = {};
  const m = (name?: string): Marks | undefined => {
    if (!name) return undefined;
    return (out[name] = out[name] ?? {});
  };
  for (const e of events) {
    if (e.type === 'yellow') { const x = m(e.playerName); if (x) x.card = x.card === 'yellow' ? 'two-yellow' : x.card ?? 'yellow'; }
    else if (e.type === 'red') { const x = m(e.playerName); if (x) x.card = e.secondYellow ? 'two-yellow' : 'red'; }
    else if (e.type === 'sub') { const x = m(e.playerName); if (x) x.subOff = e.minute; } // playerName = off
    else if (e.type === 'goal') { const x = m(e.playerName); if (x) x.goals = (x.goals ?? 0) + 1; } // own goals aren't credited to the scorer's badge
  }
  return out;
}
/** Subs who came on (name → minute). */
function subsIn(events: FootballEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) if (e.type === 'sub' && e.secondName) out[e.secondName] = e.minute;
  return out;
}

const CardDot = ({ card }: { card: Marks['card'] }) =>
  card ? (
    // A "two-yellow" is a red (second yellow) → red badge with a small "2".
    <View style={[s.cardMark, { backgroundColor: card === 'yellow' ? theme.colors.accent : theme.colors.danger }]}>
      {card === 'two-yellow' ? <Text style={s.cardMarkText}>2</Text> : null}
    </View>
  ) : null;

function Avatar({ photoUrl, label, color, size = 36 }: { photoUrl?: string; label: string; color: string; size?: number }) {
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#fff' }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#fff', backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#06120D', fontSize: size * 0.34, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

function PlayerDot({
  slot, color, top, left, jersey, photoUrl, marks,
}: {
  slot: LineupSlot; color: string; top: string; left: string; jersey?: number; photoUrl?: string; marks?: Marks;
}) {
  const name = useMask().name(slot.playerName) || undefined;
  return (
    <View style={[s.dotWrap, { top: top as unknown as number, left: left as unknown as number }]}>
      <View>
        <Avatar photoUrl={photoUrl} label={initials(name, slot.position)} color={color} />
        <CardDot card={marks?.card} />
        {slot.isCaptain && (
          <View style={s.captMark}><Text style={s.captMarkText}>C</Text></View>
        )}
        {marks?.subOff != null && (
          <View style={s.subMark}><Text style={s.subMarkText}>↓</Text></View>
        )}
        {marks?.goals ? (
          <View style={s.goalMark}><Text style={s.goalMarkText}>⚽{marks.goals > 1 ? marks.goals : ''}</Text></View>
        ) : null}
      </View>
      <Text style={s.name} numberOfLines={1}>
        {jersey != null ? `${jersey} ` : ''}{name ? name.split(' ').slice(-1)[0] : slot.position}
      </Text>
      {marks?.subOff != null && <Text style={s.subMin}>{marks.subOff}&apos;</Text>}
    </View>
  );
}

export function LineupView({
  homeLineup = [], awayLineup = [], homeRoster = [], awayRoster = [], events = [],
  homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, homeManager, awayManager,
  homeFormation, awayFormation, canEditHome, canEditAway, onEditLineup,
}: {
  homeLineup?: LineupSlot[]; awayLineup?: LineupSlot[]; homeRoster?: Player[]; awayRoster?: Player[];
  events?: FootballEvent[]; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
  homeManager?: string; awayManager?: string; homeFormation?: string; awayFormation?: string;
  canEditHome?: boolean; canEditAway?: boolean; onEditLineup?: (side: 'home' | 'away') => void;
}) {
  const marks = deriveMarks(events);
  const cameOn = subsIn(events);
  const byId = (roster: Player[]) => new Map(roster.map((p) => [p.id, p]));
  const homeById = byId(homeRoster);
  const awayById = byId(awayRoster);
  const jersey = (id?: string, roster?: Map<string, Player>) => (id && roster ? roster.get(id)?.jerseyNo : undefined);
  const photo = (id?: string, roster?: Map<string, Player>) => (id && roster ? roster.get(id)?.photoUrl : undefined);

  const starterIds = (lineup: LineupSlot[]) => new Set(lineup.filter((l) => l.playerId).map((l) => l.playerId));
  const bench = (roster: Player[], lineup: LineupSlot[]) => {
    const starters = starterIds(lineup);
    return roster.filter((p) => !starters.has(p.id));
  };

  const placed = (lineup: LineupSlot[]) => lineup.filter((l) => l.playerId).length;
  const TeamHeader = ({ name, color, lineup, manager, formation, side }: { name: string; color: string; lineup: LineupSlot[]; manager?: string; formation?: string; side: 'home' | 'away' }) => (
    <View style={{ gap: 2 }}>
      <View style={s.teamHead}>
        <View style={[s.teamDot, { backgroundColor: color }]} />
        <Text style={s.teamName} numberOfLines={1}>{name}</Text>
        <View style={s.formPill}><Text style={s.formText}>{formation || formationLabel(lineup)}</Text></View>
      </View>
      {manager ? <Text style={s.manager}>🧑‍💼 {manager}</Text> : null}
      {(side === 'home' ? canEditHome : canEditAway) && onEditLineup && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Edit ${name} lineup and formation`}
          style={s.editBtn}
          activeOpacity={0.85}
          onPress={() => onEditLineup(side)}
        >
          <Text style={s.editBtnText}>✎ {placed(lineup) > 0 ? 'Edit' : 'Set'} lineup &amp; formation ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const BenchList = ({ roster, lineup, color, side, teamName }: { roster: Player[]; lineup: LineupSlot[]; color: string; side: 'home' | 'away'; teamName: string }) => {
    const mask = useMask();
    const list = bench(roster, lineup);
    return (
      <View style={s.benchCol}>
        <View style={[s.benchHead, side === 'away' && { flexDirection: 'row-reverse' }]}>
          <View style={[s.teamDot, { backgroundColor: color }]} />
          <Text style={[s.benchColTitle, { color }]} numberOfLines={1}>{teamName} · {list.length}</Text>
        </View>
        {list.length === 0 ? <Text style={s.muted}>No bench listed</Text> : list.map((p) => {
          const onMin = cameOn[p.fullName];
          const m = marks[p.fullName];
          return (
            <View key={p.id} style={[s.benchRow, side === 'away' && { flexDirection: 'row-reverse' }]}>
              <Avatar photoUrl={p.photoUrl} label={initials(p.fullName)} color={color} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={[s.benchName, side === 'away' && { textAlign: 'right' }]} numberOfLines={1}>{p.jerseyNo ? `${p.jerseyNo} ` : ''}{mask.byId(p.id, p.fullName)}</Text>
                {onMin != null && <Text style={[s.benchSub, side === 'away' && { textAlign: 'right' }]}>↑ {onMin}&apos;</Text>}
              </View>
              {m?.goals ? <Text style={s.benchGoal}>⚽{m.goals > 1 ? m.goals : ''}</Text> : null}
              {m?.card ? <CardDot card={m.card} /> : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <TeamHeader name={homeName} color={homeColor} lineup={homeLineup} manager={homeManager} formation={homeFormation} side="home" />
      <View style={s.pitch}>
        <View style={s.halfway} />
        <View style={s.centre} />
        <View style={s.centreSpot} />
        <View style={[s.box, s.boxTop]} />
        <View style={[s.box, s.boxBottom]} />
        <View style={[s.goalArea, s.goalAreaTop]} />
        <View style={[s.goalArea, s.goalAreaBottom]} />
        <View style={[s.penSpot, s.penSpotTop]} />
        <View style={[s.penSpot, s.penSpotBottom]} />
        {/* Home occupies the top half (matching its header above); away the bottom. */}
        {homeLineup.map((slot, i) => (
          <PlayerDot key={`h${i}`} slot={slot} color={homeColor} jersey={jersey(slot.playerId, homeById)} photoUrl={photo(slot.playerId, homeById)} marks={slot.playerName ? marks[slot.playerName] : undefined}
            top={`${(slot.y * 0.46 + 0.05) * 100}%`} left={`${(1 - slot.x) * 100}%`} />
        ))}
        {awayLineup.map((slot, i) => (
          <PlayerDot key={`a${i}`} slot={slot} color={awayColor} jersey={jersey(slot.playerId, awayById)} photoUrl={photo(slot.playerId, awayById)} marks={slot.playerName ? marks[slot.playerName] : undefined}
            top={`${(1 - (slot.y * 0.46 + 0.05)) * 100}%`} left={`${slot.x * 100}%`} />
        ))}
      </View>
      <TeamHeader name={awayName} color={awayColor} lineup={awayLineup} manager={awayManager} formation={awayFormation} side="away" />

      <Text style={s.benchTitle}>Bench</Text>
      <View style={s.benchWrap}>
        <BenchList roster={homeRoster} lineup={homeLineup} color={homeColor} side="home" teamName={homeName} />
        <BenchList roster={awayRoster} lineup={awayLineup} color={awayColor} side="away" teamName={awayName} />
      </View>

      <View style={s.legend}>
        {[['⚽', 'Goal'], ['🟨', 'Yellow'], ['🟥', 'Red'], ['2️⃣', '2 yellows'], ['↑', 'Sub in'], ['↓', 'Sub out']].map(([i, l]) => (
          <View key={l} style={s.legendItem}><Text style={s.legendIcon}>{i}</Text><Text style={s.muted}>{l}</Text></View>
        ))}
      </View>
    </View>
  );
}

const line = 'rgba(255,255,255,0.25)';
const s = StyleSheet.create({
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  teamDot: { width: 14, height: 14, borderRadius: 7 },
  teamName: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  formPill: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: 2, paddingHorizontal: 10 },
  formText: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  manager: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600', marginLeft: theme.spacing(4) },
  editBtn: { alignSelf: 'flex-start', marginLeft: theme.spacing(4), marginTop: 2, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  editBtnText: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '800' },
  pitch: { width: '100%', aspectRatio: 0.62, backgroundColor: '#143d2b', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  halfway: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: line },
  centre: { position: 'absolute', top: '50%', left: '50%', width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: line, marginLeft: -32, marginTop: -32 },
  box: { position: 'absolute', left: '25%', width: '50%', height: '13%', borderWidth: 1, borderColor: line },
  boxTop: { top: 0, borderTopWidth: 0 },
  boxBottom: { bottom: 0, borderBottomWidth: 0 },
  centreSpot: { position: 'absolute', top: '50%', left: '50%', width: 4, height: 4, borderRadius: 2, backgroundColor: line, marginLeft: -2, marginTop: -2 },
  goalArea: { position: 'absolute', left: '37.5%', width: '25%', height: '6%', borderWidth: 1, borderColor: line },
  goalAreaTop: { top: 0, borderTopWidth: 0 },
  goalAreaBottom: { bottom: 0, borderBottomWidth: 0 },
  penSpot: { position: 'absolute', left: '50%', width: 3, height: 3, borderRadius: 1.5, backgroundColor: line, marginLeft: -1.5 },
  penSpotTop: { top: '9%' },
  penSpotBottom: { bottom: '9%' },
  dotWrap: { position: 'absolute', width: 70, marginLeft: -35, alignItems: 'center' },
  name: { color: '#fff', fontSize: 9, fontWeight: '700', marginTop: 2 },
  subMin: { color: theme.colors.danger, fontSize: 8, fontWeight: '800' },
  cardMark: { position: 'absolute', top: -4, right: -4, width: 12, height: 16, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  cardMarkText: { color: '#06120D', fontSize: 8, fontWeight: '900' },
  subMark: { position: 'absolute', bottom: -2, left: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.danger, alignItems: 'center', justifyContent: 'center' },
  subMarkText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  goalMark: { position: 'absolute', bottom: -3, right: -6, minWidth: 16, height: 16, paddingHorizontal: 2, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  goalMarkText: { color: '#06120D', fontSize: 9, fontWeight: '900' },
  captMark: { position: 'absolute', top: -4, left: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  captMarkText: { color: '#06120D', fontSize: 8, fontWeight: '900' },
  benchTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', textAlign: 'center' },
  benchWrap: { flexDirection: 'row', gap: theme.spacing(3) },
  benchCol: { flex: 1, gap: theme.spacing(2) },
  benchHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  benchColTitle: { flex: 1, fontSize: theme.font.tiny, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  benchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  benchName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  benchSub: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '700' },
  benchGoal: { fontSize: 12 },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3), justifyContent: 'center', paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  legendIcon: { fontSize: 12 },
});
