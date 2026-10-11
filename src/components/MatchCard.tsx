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
import { matchLine, resultWords } from '../sports/matchLine';

/** A stored snapshot from an older engine must never break a card. */
function safeLine(f: () => string): string {
  try { return f() || ''; } catch { return ''; }
}

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

/** `onStart` (parity #13): the scorer's one-tap "▶ Start scoring" / "Continue
 *  scoring" straight into the Scoring tab. */
export function MatchCard({ match, onPress, onStart }: { match: Match; onPress: () => void; onStart?: () => void }) {
  const plugin = getSport(match.sport);
  const tz = useUserTimeZone(); // show kickoff in the viewer's own timezone
  const time = formatShort(match.startsAt, tz);
  const live = match.status === 'live';
  // Play paused (drinks, rain, stumps…) — an amber BREAK tag instead of LIVE.
  const onBreak = live && !!match.onBreak;
  const done = match.status === 'completed';
  const postponed = match.status === 'postponed';
  const cancelled = match.status === 'cancelled';
  const walkover = done && match.walkover;
  const showScore = (live || done) && !!match.score && !walkover;
  // SD-01/SD-20: a finished set/game match shows its per-set line under the
  // sets/games score ("21-18, 19-21, 21-15"; tennis "6-4, 3-6, 7-6(4)"; closed by
  // hand "6-4, 3-2 ret."). A walkover already reads W/O in the middle.
  const setLine = done && showScore ? matchLine(match) : '';
  // SD-56: football's half-time score ("HT 1-0") under a live / final score.
  const cardLine = showScore && !setLine && match.state && plugin.cardLine ? safeLine(() => plugin.cardLine!(match.state as never)) : '';

  return (
    // The start button sits beside (not inside) the card's touchable — a button
    // can't nest inside another button on web.
    <View style={[s.card, live && s.cardLive]}>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${plugin.name}: ${match.homeTeam.name} versus ${match.awayTeam.name}${
        showScore ? `, ${match.score!.home} to ${match.score!.away}${setLine ? ` (${setLine})` : ''}${cardLine ? ` (${cardLine})` : ''}` : ''
      }, ${onBreak ? 'on a break' : live ? 'live now' : done ? 'final' : time}`}
      style={s.body}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={s.top}>
        <Text style={s.sport}>
          {plugin.icon} {plugin.name}
        </Text>
        {onBreak ? (
          <Text style={s.breakTag}>⏸ BREAK</Text>
        ) : live ? (
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
        ) : walkover ? (
          <Text style={s.walkover}>W/O</Text>
        ) : (
          <Text style={s.vs}>vs</Text>
        )}

        <View style={[s.side, s.sideRight]}>
          <View style={[s.dot, { backgroundColor: match.awayTeam.colorHex }]} />
          <Text style={s.team} numberOfLines={1}>{match.awayTeam.name}</Text>
        </View>
      </View>

      {setLine ? <Text style={s.setLine} numberOfLines={1}>{setLine}</Text> : null}
      {cardLine ? <Text style={s.setLine} numberOfLines={1}>{cardLine}</Text> : null}

      {/* Footer: call-to-action / kickoff, plus venue */}
      <Text style={s.foot}>
        {live ? (
          <Text style={s.cta}>tap to score ›</Text>
        ) : done ? (
          match.result ? resultWords({ sport: match.sport, result: match.result }, match.homeTeam.name, match.awayTeam.name) : walkover ? 'Walkover' : 'Full time'
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
      {onStart && (live || match.status === 'scheduled') ? (
        <TouchableOpacity style={s.startBtn} activeOpacity={0.85} accessibilityRole="button"
          accessibilityLabel={live ? 'Continue scoring' : 'Start scoring'} onPress={onStart}>
          <Text style={s.startText}>{live ? '▶ Continue scoring' : '▶ Start scoring'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
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
  body: { gap: theme.spacing(3) },
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
  breakTag: { color: theme.colors.accent, backgroundColor: theme.colors.accent + '22', fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, overflow: 'hidden' },
  startBtn: { backgroundColor: theme.colors.primary + '1F', borderWidth: 1, borderColor: theme.colors.primary + '66', borderRadius: theme.radius.pill, paddingVertical: theme.spacing(2), alignItems: 'center' },
  startText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
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
  setLine: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  scoreSep: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2) },
  walkover: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: theme.spacing(2) },

  foot: { color: theme.colors.textMuted, fontSize: theme.font.small },
  cta: { color: theme.colors.primary, fontWeight: '700' },
  venue: { color: theme.colors.primary, fontSize: theme.font.small },
  venueText: { textDecorationLine: 'underline' },
});
