/** The "⚠️ clash" banner shown when a chosen time + venue collides with another
 *  fixture — one ground can't host two overlapping games, and a team can't be in
 *  two places at once. Advisory, not a block: organizers sometimes double-book
 *  knowingly (loosely-named pitches, a team that agreed to a quick turnaround),
 *  so it warns and lets them proceed. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { formatShort, useUserTimeZone } from '../core/time';
import type { ScheduleConflict } from '../data/scheduleConflicts';

export function ConflictNotice({ conflicts }: { conflicts: ScheduleConflict[] }) {
  const tz = useUserTimeZone();
  if (conflicts.length === 0) return null;

  // One line per distinct clash — dedupe so the same fixture isn't listed twice.
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const c of conflicts) {
    const when = c.other.startsAt ? formatShort(c.other.startsAt, tz) : 'the same time';
    const vs = `${c.other.homeTeam?.name ?? 'Home'} vs ${c.other.awayTeam?.name ?? 'Away'}`;
    const text =
      c.kind === 'venue'
        ? `${c.other.venueName} already hosts ${vs} at ${when}.`
        : `${c.teamName} is already playing ${vs} at ${when}.`;
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }

  return (
    <View style={st.wrap} accessibilityRole="alert">
      <Text style={st.title}>⚠️ Scheduling clash</Text>
      {lines.map((l) => (
        <Text key={l} style={st.line}>
          •  {l}
        </Text>
      ))}
      <Text style={st.foot}>You can still save — this is just a heads-up.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.accent + '1A',
    borderColor: theme.colors.accent + '66',
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
    gap: theme.spacing(1),
  },
  title: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  line: { color: theme.colors.text, fontSize: theme.font.small, lineHeight: 18 },
  foot: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: theme.spacing(1) },
});
