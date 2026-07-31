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
  /** outcome accent: goals green, red cards red, yellows amber */
  tone?: 'boundary' | 'wicket' | 'extra';
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
  const tone = e.type === 'goal' || e.type === 'owngoal' ? 'boundary' : e.type === 'red' ? 'wicket' : e.type === 'yellow' ? 'extra' : undefined;
  return { key: `e${e.id}`, minute: e.minute, order: e.id, icon: EVENT_META[e.type].icon, label, detail, side: e.side, tone };
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
    // "Player on Victim", else "Player (Team)" when attributed, else just the team
    // (a team-level foul reads "Argentina", not "Argentina (Argentina)").
    detail = st.secondName ? `${who} on ${st.secondName}` : st.playerName ? `${who} (${team})` : team;
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
  max = 60,
}: {
  events: FootballEvent[];
  stats?: StatEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  max?: number;
}) {
  const mask = useMask();
  const all: Item[] = [
    ...events.map((e) => eventItem(e, homeName, awayName)),
    ...stats.filter((st) => STAT_IN_TIMELINE.has(st.kind)).map((st) => statItem(st, homeName, awayName)),
  ].sort((a, b) => b.minute - a.minute || b.order - a.order);
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
            <Text style={[st.minute, { color: sideColor }]}>{it.minute}&apos;</Text>
            <Text style={st.icon}>{it.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.label, (it.tone === 'boundary' || it.tone === 'wicket') && { color: toneColor! }]}>{it.label}</Text>
              <Text style={st.detail}>{mask.text(it.detail)}</Text>
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
  minute: { fontSize: theme.font.body, fontWeight: '800', width: 34 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  latestTag: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  moreNote: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(2), marginLeft: theme.spacing(5) },
});
