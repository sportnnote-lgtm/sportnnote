/** A match row used on Home and Schedule. Tapping opens the live-scoring screen.
 *
 *  Reads like a scoreboard: the two teams flank a bold central score, so a live
 *  or finished result is legible at a glance. Live matches are set apart with a
 *  red glow and a pulsing "LIVE" badge — this is a live-scoring app, so an
 *  in-progress game should never look like a scheduled one. */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { getSport } from '../sports/registry';
import { openVenue } from '../core/venue';
import { formatShort, useUserTimeZone } from '../core/time';
import type { Match } from '../core/types';

/** A small dot that gently pulses — the universal "live" signal. */
function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={s.liveBadge}>
      <Animated.View style={[s.liveDot, { opacity: pulse }]} />
      <Text style={s.liveText}>LIVE</Text>
    </View>
  );
}

export function MatchCard({ match, onPress }: { match: Match; onPress: () => void }) {
  const plugin = getSport(match.sport);
  const tz = useUserTimeZone(); // show kickoff in the viewer's own timezone
  const time = formatShort(match.startsAt, tz);
  const live = match.status === 'live';
  const done = match.status === 'completed';
  const postponed = match.status === 'postponed';
  const cancelled = match.status === 'cancelled';
  const showScore = (live || done) && !!match.score;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${plugin.name}: ${match.homeTeam.name} versus ${match.awayTeam.name}${
        showScore ? `, ${match.score!.home} to ${match.score!.away}` : ''
      }, ${live ? 'live now' : done ? 'final' : time}`}
      style={[s.card, live && s.cardLive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={s.top}>
        <Text style={s.sport}>
          {plugin.icon} {plugin.name}
        </Text>
        {live ? (
          <LiveBadge />
        ) : done ? (
          <Text style={s.finalTag}>FINAL</Text>
        ) : cancelled ? (
          <Text style={s.cancelledTag}>CANCELLED</Text>
        ) : postponed ? (
          <Text style={s.postponedTag}>POSTPONED</Text>
        ) : (
          <Text style={s.timeTag}>{time}</Text>
        )}
      </View>

      {/* Scoreboard: team · score · team */}
      <View style={s.board}>
        <View style={[s.side, s.sideLeft]}>
          <Text style={s.team} numberOfLines={1}>{match.homeTeam.name}</Text>
          <View style={[s.dot, { backgroundColor: match.homeTeam.colorHex }]} />
        </View>

        {showScore ? (
          <View style={s.scoreWrap}>
            <Text style={[s.score, live && s.scoreLive]}>{match.score!.home}</Text>
            <Text style={s.scoreSep}>–</Text>
            <Text style={[s.score, live && s.scoreLive]}>{match.score!.away}</Text>
          </View>
        ) : (
          <Text style={s.vs}>vs</Text>
        )}

        <View style={[s.side, s.sideRight]}>
          <View style={[s.dot, { backgroundColor: match.awayTeam.colorHex }]} />
          <Text style={s.team} numberOfLines={1}>{match.awayTeam.name}</Text>
        </View>
      </View>

      {/* Footer: call-to-action / kickoff, plus venue */}
      <Text style={s.foot}>
        {live ? (
          <Text style={s.cta}>tap to score ›</Text>
        ) : done ? (
          'Full time'
        ) : (
          time
        )}
        {match.venueName ? (
          <>
            {'  ·  '}
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
    ...theme.shadow.card,
  },
  cardLive: {
    borderColor: theme.colors.danger + '66',
    ...theme.shadow.live,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sport: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    backgroundColor: theme.colors.danger + '22',
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2),
    borderRadius: theme.radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.danger },
  liveText: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  finalTag: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  postponedTag: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  cancelledTag: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  timeTag: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },

  board: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  sideLeft: { justifyContent: 'flex-end' },
  sideRight: { justifyContent: 'flex-start' },
  team: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', flexShrink: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },

  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  score: { color: theme.colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, minWidth: 20, textAlign: 'center' },
  scoreLive: { color: theme.colors.primary },
  scoreSep: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2) },

  foot: { color: theme.colors.textMuted, fontSize: theme.font.small },
  cta: { color: theme.colors.primary, fontWeight: '700' },
  venue: { color: theme.colors.primary, fontSize: theme.font.small },
  venueText: { textDecorationLine: 'underline' },
});
