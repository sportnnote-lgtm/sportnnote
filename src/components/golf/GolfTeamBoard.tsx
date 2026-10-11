/** SD-76 — the team leaderboard for team stroke play (best N of M): position
 *  (T for ties after countback), team, total, thru, the rounds of a
 *  multi-round event; tap a team for its players — counting scores ✓, the
 *  discarded ones struck through. Sits beside the individual leaderboard. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../ui';
import { toParLabel } from '../../sports/golf/engine';
import { buildTeamLeaderboard, teamRuleLabel } from '../../data/golfTeams';
import { golfFormatOf } from '../../data/golfLeaderboard';
import type { FieldEntry, FieldEvent, GolfCourse } from '../../core/types';

export function GolfTeamBoard({ events, entries, courses, teamName, nameOf }: {
  events: FieldEvent[];
  entries: FieldEntry[];
  courses: GolfCourse[];
  teamName: (teamId: string) => string;
  nameOf: (playerId: string) => string;
}) {
  const { format, rows } = useMemo(() => buildTeamLeaderboard(events, entries, courses), [events, entries, courses]);
  const [open, setOpen] = useState<string | null>(null);
  if (!format) return null;
  const last = [...events].sort((a, b) => a.roundNo - b.roundNo).at(-1)!;
  const stableford = golfFormatOf(last).scoring === 'stableford';
  const fmt = (n: number) => (stableford ? `${n} pts` : toParLabel(n));
  const sizes = rows.map((r) => r.memberScores.size);
  const size = sizes.length && sizes.every((x) => x === sizes[0]) ? sizes[0] : undefined;
  const multi = events.length > 1;
  const dir = stableford ? -1 : 1;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>{teamRuleLabel(format, size)}. Ties: the non-counting score, then the last 9 / 6 / 3 / 1 holes.</Text>
      {!rows.length ? <Text style={textStyles.muted}>No team scores yet — give players a team in the round setup.</Text> : (
        <View style={st.table}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ flexGrow: 1 }}>
              <View style={[st.row, st.head]}>
                <Text style={[st.pos, st.headTxt]}>Pos</Text>
                <Text style={[st.name, st.headTxt]}>Team</Text>
                <Text style={[st.num, st.headTxt]}>{stableford ? 'Pts' : 'Total'}</Text>
                <Text style={[st.thru, st.headTxt]}>Thru</Text>
                {multi && events.map((e) => <Text key={e.id} style={[st.thru, st.headTxt]}>R{e.roundNo}</Text>)}
              </View>
              {rows.map((r) => {
                const cur = r.rounds[r.rounds.length - 1];
                const thru = !cur || cur.thru === 0 ? '–' : cur.thru >= cur.holes ? 'F' : String(cur.thru);
                return (
                  <View key={r.teamId}>
                    <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => setOpen(open === r.teamId ? null : r.teamId)}
                      accessibilityLabel={`${teamName(r.teamId)}, ${r.positionLabel}, ${r.short ? 'no team score' : fmt(r.total)}`}>
                      <View style={st.row}>
                        <Text style={[st.pos, r.short && st.mutedTxt]}>{r.positionLabel}</Text>
                        <View style={st.name}>
                          <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{teamName(r.teamId)}</Text>
                          {r.short ? <Text style={st.sub}>Fewer than {format.count} scores</Text> : null}
                        </View>
                        <Text style={[st.num, st.bold, r.position === 1 && st.leader]}>{r.short ? '–' : fmt(r.total)}</Text>
                        <Text style={st.thru}>{r.short ? '–' : thru}</Text>
                        {multi && r.rounds.map((c, i) => <Text key={i} style={[st.thru, st.mutedTxt]}>{c?.total == null ? '–' : stableford ? String(c.total) : toParLabel(c.total)}</Text>)}
                      </View>
                    </TouchableOpacity>
                    {open === r.teamId && (
                      <View style={st.members}>
                        {[...r.memberScores.entries()].sort((a, b) => dir * ((a[1] ?? dir * 999) - (b[1] ?? dir * 999))).map(([pid, v]) => {
                          const counted = cur?.counted.includes(pid) && format.mode === 'round';
                          const dropped = cur?.discarded.includes(pid);
                          return (
                            <View key={pid} style={st.memberRow}>
                              <Text style={[textStyles.body, { flex: 1 }, dropped && st.dropped]} numberOfLines={1}>{counted ? '✓ ' : ''}{nameOf(pid)}</Text>
                              <Text style={[st.num, dropped && st.dropped]}>{v == null ? '–' : fmt(v)}</Text>
                            </View>
                          );
                        })}
                        <Text style={st.sub}>{format.mode === 'hole' ? `Best ${format.count} on each hole count.` : `✓ counts · struck through = discarded this round.`}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  table: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing(2) },
  head: { borderTopWidth: 0, backgroundColor: theme.colors.surfaceAlt },
  headTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  pos: { width: 32, color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  name: { flex: 1, minWidth: 120 },
  num: { width: 56, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small },
  thru: { width: 34, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small },
  bold: { fontWeight: '800' },
  leader: { color: theme.colors.primary },
  mutedTxt: { color: theme.colors.textMuted },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
  members: { backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), gap: theme.spacing(1) },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dropped: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
});
