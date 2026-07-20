/** A match row used on Home and Schedule. Tapping opens the live-scoring screen. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Pill } from './ui';
import { getSport } from '../sports/registry';
import { openVenue } from '../core/venue';
import { formatShort, useUserTimeZone } from '../core/time';
import type { Match } from '../core/types';

const statusColor = (s: Match['status']) =>
  s === 'live' ? theme.colors.danger : s === 'completed' ? theme.colors.textMuted : theme.colors.accent;

export function MatchCard({ match, onPress }: { match: Match; onPress: () => void }) {
  const plugin = getSport(match.sport);
  const tz = useUserTimeZone(); // show kickoff in the viewer's own timezone
  const time = formatShort(match.startsAt, tz);
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={onPress}>
      <View style={s.top}>
        <Text style={s.sport}>
          {plugin.icon} {plugin.name}
        </Text>
        <Pill
          label={match.status.toUpperCase()}
          color={theme.colors.surfaceAlt}
          textColor={statusColor(match.status)}
        />
      </View>
      <View style={s.teams}>
        <View style={[s.dot, { backgroundColor: match.homeTeam.colorHex }]} />
        <Text style={s.team} numberOfLines={1}>{match.homeTeam.name}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={[s.team, s.right]} numberOfLines={1}>{match.awayTeam.name}</Text>
        <View style={[s.dot, { backgroundColor: match.awayTeam.colorHex }]} />
      </View>
      <Text style={s.time}>
        {match.status === 'live'
          ? match.score
            ? `● Live · ${match.homeTeam.shortName} ${match.score.home}–${match.score.away} ${match.awayTeam.shortName} · tap to score`
            : '● Live now · tap to score'
          : match.status === 'completed' && match.score
          ? `Final · ${match.homeTeam.shortName} ${match.score.home}–${match.score.away} ${match.awayTeam.shortName}`
          : time}
        {match.venueName ? (
          <>
            {' · '}
            <Text
              style={s.venue}
              onPress={() => openVenue(match.venueName, match.venueMapsUrl)}
              suppressHighlighting
            >
              📍 <Text style={s.venueText}>{match.venueName}</Text>
            </Text>
          </>
        ) : null}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    gap: theme.spacing(3),
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sport: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  teams: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  team: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  right: { textAlign: 'right' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.small },
  time: { color: theme.colors.textMuted, fontSize: theme.font.small },
  venue: { color: theme.colors.primary, fontSize: theme.font.small },
  venueText: { textDecorationLine: 'underline' },
});
