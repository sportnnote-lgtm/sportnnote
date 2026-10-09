/** Generic post-match (or live) summary for any sport without its own Summary:
 *  the result, an MVP, and every contributor's 1–5 star rating built from the
 *  match's recorded stat lines. Cricket ships a richer state-based summary. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, EmptyState, textStyles } from './ui';
import { RankBadge, podiumColor } from './Rank';
import { useMask } from '../core/disputeMask';
import { matchRatings, awardsFor, ratingStars, statLabel, resolvePotm, type MatchRating, type PotmProp } from '../data/ratings';
import type { Player, SportId, StatLine } from '../core/types';
import type { ScoreSummary } from '../sports/types';

/** Up to two initials from a (possibly masked) name, for a rating-row avatar. */
const initials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function MatchSummary({
  statLines, sport, homeRoster, awayRoster, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away,
  summary, complete, live, onPlayer, potm,
}: {
  statLines: StatLine[];
  sport: SportId;
  homeRoster: Player[];
  awayRoster: Player[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  summary: ScoreSummary;
  complete: boolean;
  /** match is underway (not just "not complete") — drives the result live dot */
  live?: boolean;
  onPlayer?: (id: string) => void;
  /** the stored Player of the Match override (parity #21) — beats the computed MVP */
  potm?: PotmProp;
}) {
  const { players, mvp: computedMvp } = matchRatings(statLines, sport, homeRoster, awayRoster);
  // REVIEW Decision 10: a stored override always wins over the (re)computed MVP.
  const pick = resolvePotm(complete ? potm : undefined, undefined, computedMvp);
  const sideOf = (id?: string): 'home' | 'away' => (id && awayRoster.some((p) => p.id === id) ? 'away' : 'home');
  const mvp: (MatchRating & { changed?: boolean }) | undefined = !pick ? undefined
    : pick.source === 'mvp' ? computedMvp
    : { ...(players.find((p) => p.id === pick.id) ?? { id: pick.id ?? '', name: pick.name, side: sideOf(pick.id), points: 0, rating: 0, detail: '', stats: {} }), changed: pick.changed };
  const awards = awardsFor(players, sport);
  const mask = useMask();
  const teamColor = (s: 'home' | 'away') => (s === 'home' ? homeColor : awayColor);
  const teamName = (s: 'home' | 'away') => (s === 'home' ? homeName : awayName);

  // Once a match is decided, dim the loser's score so the winner reads at a
  // glance (the app's "results board" cue). Draws / non-numeric scores (pens,
  // shootouts) keep both at full strength.
  const hs = parseFloat(summary.homeScore), as = parseFloat(summary.awayScore);
  const decided = complete && !isNaN(hs) && !isNaN(as) && hs !== as;
  const homeWon = decided && hs > as;
  const awayWon = decided && as > hs;

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {/* Result */}
      <View style={st.result}>
        <View style={st.resultLabelRow}>
          {live && !complete ? <View style={st.liveDot} /> : null}
          <Text style={st.resultLabel}>{summary.statusLine}</Text>
        </View>
        <View style={st.scoreRow}>
          <View style={[st.side, decided && !homeWon && st.scoreLost]}>
            <Text style={[st.score, { color: homeColor }]}>{summary.homeScore}</Text>
            <Text style={[st.sideName, { color: homeColor }]} numberOfLines={1}>{homeName}</Text>
          </View>
          <Text style={st.colon}>:</Text>
          <View style={[st.side, decided && !awayWon && st.scoreLost]}>
            <Text style={[st.score, { color: awayColor }]}>{summary.awayScore}</Text>
            <Text style={[st.sideName, { color: awayColor }]} numberOfLines={1}>{awayName}</Text>
          </View>
        </View>
        {complete && decided ? (
          <Text style={st.winner}>🏆 {homeWon ? homeName : awayName} won</Text>
        ) : complete && !isNaN(hs) && !isNaN(as) && hs === as ? (
          <Text style={st.drawn}>Match drawn</Text>
        ) : null}
      </View>

      {mvp && (
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => mvp.id && onPlayer?.(mvp.id)} style={st.mvp}>
          <View style={[st.mvpAvatar, { backgroundColor: teamColor(mvp.side) }]}>
            <Text style={st.mvpAvatarText}>{initials(mask.byId(mvp.id, mvp.name))}</Text>
            <Text style={st.mvpBadge}>{complete ? '🏅' : '🔥'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.mvpLabel}>{complete ? 'Player of the Match' : 'Top performer'}</Text>
            <Text style={st.mvpName} numberOfLines={1}>{mask.byId(mvp.id, mvp.name)}</Text>
            <Text style={st.mvpDetail} numberOfLines={1}>{[mvp.detail, teamName(mvp.side)].filter(Boolean).join(' · ')}</Text>
            {mvp.changed ? <Text style={st.mvpNote} numberOfLines={1}>Chosen by officials</Text> : null}
          </View>
          {mvp.rating > 0 ? <Text style={[st.mvpRating, { color: teamColor(mvp.side) }]}>★{mvp.rating.toFixed(1)}</Text> : null}
        </TouchableOpacity>
      )}

      {awards.length > 0 && (
        <View style={st.awardGrid}>
          {awards.map((a) => {
            const nm = mask.byId(a.player.id, a.player.name);
            return (
            <TouchableOpacity accessibilityRole="button" key={a.label} activeOpacity={0.85} onPress={() => onPlayer?.(a.player.id)} style={st.award}>
              <View style={[st.awardAvatar, { backgroundColor: teamColor(a.player.side) }]}>
                <Text style={st.awardAvatarText}>{initials(nm)}</Text>
                <Text style={st.awardBadge}>{a.icon}</Text>
              </View>
              <Text style={st.awardLabel} numberOfLines={1}>{a.label}</Text>
              <Text style={st.awardName} numberOfLines={1}>{nm}</Text>
              <Text style={st.awardVal} numberOfLines={1}>{a.value} {statLabel(a.stat, a.value)}</Text>
            </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={[textStyles.h3, { marginTop: theme.spacing(1) }]}>{complete ? 'Player ratings · out of 5' : 'Player ratings · so far'}</Text>
      {players.length > 0 && (
        <Text style={st.note}>
          {complete
            ? '★ Rated 1–5 from each player’s recorded stats.'
            : '⏱ Updates live — final ratings lock when the match ends.'}
        </Text>
      )}
      {players.length === 0 ? (
        <EmptyState
          icon="📊"
          title={complete ? 'No individual stats recorded' : 'No player stats yet'}
          hint={complete
            ? 'This match was scored at team level — no actions were attributed to players.'
            : 'Ratings build here as the scorer attributes goals, points and other actions to players.'}
          compact
        />
      ) : (
        <Card>
          {players.map((p: MatchRating, i) => {
            const tier = podiumColor(i);
            const dispName = mask.byId(p.id, p.name);
            return (
            <TouchableOpacity accessibilityRole="button" key={p.id} activeOpacity={onPlayer ? 0.8 : 1} onPress={() => onPlayer?.(p.id)} style={[st.row, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 0 && st.divider]}>
              <RankBadge index={i} width={22} />
              <View style={[st.rateAvatar, { backgroundColor: teamColor(p.side) }]}>
                <Text style={st.rateAvatarText}>{initials(dispName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body} numberOfLines={1}>{dispName}</Text>
                <Text style={st.detail} numberOfLines={1}>{p.detail}</Text>
              </View>
              <View style={st.ratingCol}>
                <Text style={st.stars} numberOfLines={1}>{ratingStars(p.rating)}</Text>
                <Text style={st.ratingNum}>{p.rating.toFixed(1)}</Text>
              </View>
            </TouchableOpacity>
            );
          })}
        </Card>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  result: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(4), alignItems: 'center', gap: theme.spacing(2),
  },
  resultLabelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.danger },
  resultLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, marginTop: -theme.spacing(1) },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  side: { flex: 1, alignItems: 'center', gap: 2 },
  sideName: { fontSize: theme.font.small, fontWeight: '800' },
  colon: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '300', marginHorizontal: theme.spacing(2) },
  score: { fontSize: theme.font.h1, fontWeight: '900' },
  scoreLost: { opacity: 0.45 },
  winner: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.5 },
  drawn: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.5 },
  mvp: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  mvpAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  mvpAvatarText: { color: '#06120D', fontSize: theme.font.body, fontWeight: '900' },
  mvpBadge: { position: 'absolute', bottom: -5, right: -5, fontSize: 16 },
  mvpLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  mvpName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  mvpDetail: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  mvpNote: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 1 },
  mvpRating: { fontSize: theme.font.h3, fontWeight: '900' },
  awardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  award: {
    width: '31%', flexGrow: 1, gap: 2,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  awardAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  awardAvatarText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '900' },
  awardBadge: { position: 'absolute', bottom: -4, right: -4, fontSize: 13 },
  awardLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  awardName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  awardVal: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rateAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rateAvatarText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '900' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 1 },
  ratingCol: { alignItems: 'flex-end', minWidth: 64 },
  stars: { color: theme.colors.accent, fontSize: theme.font.tiny },
  ratingNum: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900' },
});
