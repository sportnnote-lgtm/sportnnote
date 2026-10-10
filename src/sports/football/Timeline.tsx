/** Match timeline — major events plus fouls & corners, newest-first, each with
 *  its minute, icon and the players involved (incl. who fouled whom). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import type { Player } from '../../core/types';
import { playerLink, idByName } from '../playerLink';
import { EVENT_META, STAT_META, GOAL_TYPE_LABEL, BODY_PART_LABEL, type FootballEvent, type StatEvent } from './events';
import { minuteText, eventHalf, byMatchTimeDesc, type MinuteFormat } from './engine';

// One row in the merged timeline (key, sort, render).
interface Item {
  key: string;
  minute: number;
  /** the half it happened in (stored, else derived) — sorts before the minute */
  half: 1 | 2 | 3 | 4;
  order: number;
  icon: string;
  label: string;
  detail: string;
  side: 'home' | 'away';
  /** outcome accent: goals green, red cards red, yellows amber */
  tone?: 'boundary' | 'wicket' | 'extra';
  /** the row's lead player (scorer / carded / fouler / sub coming on) — tapping
   *  the detail opens their profile; events store names, so resolved via rosters */
  playerId?: string;
}

function eventItem(e: FootballEvent, homeName: string, awayName: string, rosters: (Player[] | undefined)[], f: MinuteFormat): Item {
  const team = e.side === 'home' ? homeName : awayName;
  const who = e.playerName ?? team;
  let label = EVENT_META[e.type].label;
  let detail = who;
  switch (e.type) {
    case 'goal': {
      const tags = [
        e.goalType && e.goalType !== 'open' ? GOAL_TYPE_LABEL[e.goalType] : null,
        e.bodyPart ? BODY_PART_LABEL[e.bodyPart] : null,
      ].filter(Boolean);
      if (tags.length) label = `${EVENT_META.goal.label} · ${tags.join(' · ')}`;
      detail = e.secondName ? `${who}  (assist: ${e.secondName})` : who;
      break;
    }
    case 'owngoal':
      detail = `${who} (OG → ${team})`;
      break;
    case 'sub':
      detail = `${e.secondName ?? '—'} ◂ ${who}`;
      break;
  }
  const tone = e.type === 'goal' || e.type === 'owngoal' ? 'boundary' : e.type === 'red' ? 'wicket' : e.type === 'yellow' ? 'extra' : undefined;
  const playerId = idByName(e.type === 'sub' ? e.secondName ?? e.playerName : e.playerName, ...rosters);
  return { key: `e${e.id}`, minute: e.minute, half: eventHalf(e, f), order: e.id, icon: EVENT_META[e.type].icon, label, detail, side: e.side, tone, playerId };
}

// Every scored action earns a timeline row — the scorer should see each tap here.
const STAT_IN_TIMELINE = new Set<StatEvent['kind']>([
  'shot', 'foul', 'offside', 'corner', 'tackle', 'interception', 'save', 'pass', 'cross', 'dribble', 'handball',
  'attackContribution', 'defenceContribution', 'penaltyWon', 'penaltyMissed', 'block',
]);

function statItem(st: StatEvent, homeName: string, awayName: string, rosters: (Player[] | undefined)[], f: MinuteFormat): Item {
  const team = st.side === 'home' ? homeName : awayName;
  const m = STAT_META[st.kind];
  const who = st.playerName ?? team;
  let detail = who;
  if (st.kind === 'foul') {
    // "Player on Victim", else "Player (Team)" when attributed, else just the team
    // (a team-level foul reads "Argentina", not "Argentina (Argentina)").
    detail = st.secondName ? `${who} on ${st.secondName}` : st.playerName ? `${who} (${team})` : team;
  } else if (st.kind === 'corner') {
    detail = `${team}${st.playerName ? ` · ${st.playerName}` : ''}`;
  } else if (st.kind === 'shot') {
    detail = `${who} · ${st.blocked ? 'blocked' : st.onTarget ? 'on target' : 'off target'}`;
  } else if (st.kind === 'pass') {
    detail = `${who} · ${st.complete ? 'completed' : 'misplaced'}`;
  }
  const playerId = st.playerId ?? idByName(st.playerName, ...rosters);
  return { key: `s${st.id}`, minute: st.minute, half: eventHalf(st, f), order: st.id, icon: m.icon, label: m.label, detail, side: st.side, playerId };
}

export function Timeline({
  events,
  stats = [],
  homeName,
  awayName,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  max = 60,
  halfMinutes = 45,
  etMinutes = 15,
  homeRoster,
  awayRoster,
  onPlayer,
}: {
  events: FootballEvent[];
  stats?: StatEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  max?: number;
  /** half lengths — for "45+2'" notation and per-half ordering (SD-08) */
  halfMinutes?: number;
  etMinutes?: number;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** tap a row's player → their profile */
  onPlayer?: (playerId: string) => void;
}) {
  const mask = useMask();
  const rosters = [homeRoster, awayRoster];
  const f: MinuteFormat = { halfMinutes, etMinutes };
  // Newest first by half, then minute, then log order: a first-half 45+2' sits
  // below every second-half moment (SD-08).
  const all: Item[] = [
    ...events.map((e) => eventItem(e, homeName, awayName, rosters, f)),
    ...stats.filter((st) => STAT_IN_TIMELINE.has(st.kind)).map((st) => statItem(st, homeName, awayName, rosters, f)),
  ].sort(byMatchTimeDesc);
  const items = all.slice(0, max);
  const hidden = all.length - items.length;

  if (all.length === 0) {
    return <Text style={st.empty}>No events yet — updates appear here as the match unfolds.</Text>;
  }
  return (
    <View style={st.wrap}>
      {items.map((it, i) => {
        const sideColor = it.side === 'home' ? homeColor : awayColor;
        // Goals/cards accent the node — and the label for the big ones — over the team colour.
        const toneColor = it.tone === 'boundary' ? theme.colors.primary : it.tone === 'wicket' ? theme.colors.danger : it.tone === 'extra' ? theme.colors.accent : null;
        const nodeColor = toneColor ?? sideColor;
        const latest = i === 0;
        return (
          <View key={it.key} style={st.row}>
            {/* Timeline spine: a continuous rail with a coloured node per event; the
                newest event's node gets a ring so the eye lands on it first. */}
            <View style={st.rail}>
              <View style={[st.railLine, i === 0 && st.railLineFirst, i === items.length - 1 && st.railLineLast]} />
              {latest ? <View style={[st.nodeHalo, { borderColor: nodeColor }]} /> : null}
              <View style={[st.node, { backgroundColor: nodeColor }]} />
            </View>
            <Text style={[st.minute, { color: sideColor }]}>{minuteText(it.minute, it.half, f)}</Text>
            <Text style={st.icon}>{it.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.label, (it.tone === 'boundary' || it.tone === 'wicket') && { color: toneColor! }]}>{it.label}</Text>
              <Text style={st.detail} {...playerLink(it.playerId, mask.text(it.detail), onPlayer)}>{mask.text(it.detail)}</Text>
            </View>
            {latest ? <Text style={st.latestTag}>LATEST</Text> : null}
          </View>
        );
      })}
      {hidden > 0 ? <Text style={st.moreNote}>＋ {hidden} earlier {hidden === 1 ? 'event' : 'events'}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {},
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(3),
    paddingVertical: theme.spacing(2.5),
  },
  rail: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.border },
  railLineFirst: { top: '50%' },
  railLineLast: { bottom: '50%' },
  node: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.bg },
  nodeHalo: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2, opacity: 0.5 },
  // wide enough for "90+10'" / "120+3'" at 375 px
  minute: { fontSize: theme.font.small, fontWeight: '800', width: 50 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  latestTag: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  moreNote: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(2), marginLeft: theme.spacing(5) },
});
