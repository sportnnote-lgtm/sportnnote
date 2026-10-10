/** Basketball play-by-play, newest first, stamped with quarter + minute. Shares
 *  the rail-and-nodes look of the other sports' timelines (team-coloured spine,
 *  a ring + LATEST tag on the newest play, "+N earlier" when it's capped). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import type { Player } from '../../core/types';
import { BB_META, DQ_LABEL, FOUL_LABEL, type BBEvent } from './events';
import { playerLink, idByName } from '../playerLink';

function describe(e: BBEvent): string {
  const who = e.playerName ?? 'Team';
  if (e.type === 'score') return `+${e.points ?? 0}  ${who}`;
  if (e.type === 'miss') return `${e.points === 3 ? '3PT' : `${e.points ?? 2}PT`} miss  ${who}`;
  if (e.type === 'freethrow') return `${e.made ? '✅ made' : '❌ miss'}  ${who}`;
  if (e.type === 'sub' && e.onName) return `${who} ▸ ${e.onName}`;
  if (e.type === 'foul' && e.foulType) return `${FOUL_LABEL[e.foulType]} · ${who}`;
  if (e.type === 'eject' && e.reason) return `${who} · ${DQ_LABEL[e.reason]}`;
  if (e.type === 'rebound' && e.reboundType) return `${e.reboundType === 'off' ? 'Off.' : 'Def.'} · ${who}`;
  return who;
}

export function Timeline({
  events,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  max = 60,
  homeRoster,
  awayRoster,
  onPlayer,
}: {
  events: BBEvent[];
  homeColor?: string;
  awayColor?: string;
  max?: number;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** tap a play's player → their profile (plays store names; resolved via the side's roster) */
  onPlayer?: (playerId: string) => void;
}) {
  if (events.length === 0) {
    return <Text style={st.empty}>No plays yet — updates appear here as the game unfolds.</Text>;
  }
  const ordered = [...events].sort((a, b) => b.quarter - a.quarter || b.minute - a.minute || b.id - a.id).slice(0, max);
  const hidden = events.length - ordered.length;
  return (
    <View style={st.wrap}>
      {ordered.map((e, i) => {
        const meta = BB_META[e.type];
        const color = e.side === 'home' ? homeColor : awayColor;
        const latest = i === 0;
        return (
          <View key={e.id} style={st.row}>
            {/* Timeline spine: a continuous rail with a team-coloured node per play;
                the newest play's node gets a ring so the eye lands on it first. */}
            <View style={st.rail}>
              <View style={[st.railLine, i === 0 && st.railLineFirst, i === ordered.length - 1 && st.railLineLast]} />
              {latest ? <View style={[st.nodeHalo, { borderColor: color }]} /> : null}
              <View style={[st.node, { backgroundColor: color }]} />
            </View>
            <Text style={[st.q, { color }]} numberOfLines={1}>Q{e.quarter} {e.minute}&apos;</Text>
            <Text style={st.icon}>{meta.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>{meta.label}</Text>
              <Text style={st.detail} {...playerLink(idByName(e.playerName, e.side === 'home' ? homeRoster : awayRoster), describe(e), onPlayer)}>{describe(e)}</Text>
            </View>
            {latest ? <Text style={st.latestTag}>LATEST</Text> : null}
          </View>
        );
      })}
      {hidden > 0 ? <Text style={st.moreNote}>＋ {hidden} earlier {hidden === 1 ? 'play' : 'plays'}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {},
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2.5) },
  rail: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.border },
  railLineFirst: { top: '50%' },
  railLineLast: { bottom: '50%' },
  node: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.bg },
  nodeHalo: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2, opacity: 0.5 },
  q: { fontSize: theme.font.small, fontWeight: '800', width: 56 },
  icon: { fontSize: 18 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small },
  latestTag: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  moreNote: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(2), marginLeft: theme.spacing(5) },
});
