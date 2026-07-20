/** Match timeline — major events plus fouls & corners, newest-first, each with
 *  its minute, icon and the players involved (incl. who fouled whom). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { EVENT_META, STAT_META, GOAL_TYPE_LABEL, BODY_PART_LABEL, type FootballEvent, type StatEvent } from './events';

// One row in the merged timeline (key, sort, render).
interface Item {
  key: string;
  minute: number;
  order: number;
  icon: string;
  label: string;
  detail: string;
  side: 'home' | 'away';
}

function eventItem(e: FootballEvent, homeName: string, awayName: string): Item {
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
  return { key: `e${e.id}`, minute: e.minute, order: e.id, icon: EVENT_META[e.type].icon, label, detail, side: e.side };
}

// Every scored action earns a timeline row — the scorer should see each tap here.
const STAT_IN_TIMELINE = new Set<StatEvent['kind']>([
  'shot', 'foul', 'offside', 'corner', 'tackle', 'interception', 'save', 'pass', 'cross', 'dribble', 'handball',
  'attackContribution', 'defenceContribution', 'penaltyWon', 'penaltyMissed',
]);

function statItem(st: StatEvent, homeName: string, awayName: string): Item {
  const team = st.side === 'home' ? homeName : awayName;
  const m = STAT_META[st.kind];
  const who = st.playerName ?? team;
  let detail = who;
  if (st.kind === 'foul') {
    detail = st.secondName ? `${who} on ${st.secondName}` : `${who} (${team})`;
  } else if (st.kind === 'corner') {
    detail = `${team}${st.playerName ? ` · ${st.playerName}` : ''}`;
  } else if (st.kind === 'shot') {
    detail = `${who} · ${st.onTarget ? 'on target' : 'off target'}`;
  } else if (st.kind === 'pass') {
    detail = `${who} · ${st.complete ? 'completed' : 'misplaced'}`;
  }
  return { key: `s${st.id}`, minute: st.minute, order: st.id, icon: m.icon, label: m.label, detail, side: st.side };
}

export function Timeline({
  events,
  stats = [],
  homeName,
  awayName,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
}: {
  events: FootballEvent[];
  stats?: StatEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
}) {
  const mask = useMask();
  const items: Item[] = [
    ...events.map((e) => eventItem(e, homeName, awayName)),
    ...stats.filter((st) => STAT_IN_TIMELINE.has(st.kind)).map((st) => statItem(st, homeName, awayName)),
  ].sort((a, b) => b.minute - a.minute || b.order - a.order);

  if (items.length === 0) {
    return <Text style={st.empty}>No events yet — updates appear here as the match unfolds.</Text>;
  }
  return (
    <View style={st.wrap}>
      {items.map((it) => {
        const color = it.side === 'home' ? homeColor : awayColor;
        return (
          <View key={it.key} style={st.row}>
            <Text style={[st.minute, { color }]}>{it.minute}&apos;</Text>
            <Text style={st.icon}>{it.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{it.label}</Text>
              <Text style={st.detail}>{mask.text(it.detail)}</Text>
            </View>
            <View style={[st.sideDot, { backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  minute: { fontSize: theme.font.body, fontWeight: '800', width: 34 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  sideDot: { width: 10, height: 10, borderRadius: 5 },
});
