/** SD-70 (FB-12) / SD-126 — a tournament's discipline table for one sport:
 *  each carded player's cards (football yellows / second yellows / reds,
 *  hockey and kabaddi green / yellow / red, handball warnings / 2′ / red /
 *  blue, basketball U / T / D / ejections), who is out of the team's next
 *  match, the cards per team and team officials' cards. Pure figures from
 *  src/sports/discipline.ts (football: src/sports/football/discipline.ts). */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, SelectChip, textStyles } from './ui';
import { sportDisciplineTable, sportRuleText, DISCIPLINE_SPECS, type DisciplineMatch } from '../sports/discipline';
import { playerLink } from '../sports/playerLink';
import type { SportId } from '../core/types';

const CAP = 8;

export function DisciplineTable({ matches, format, onPlayer, sport = 'football' }: {
  matches: DisciplineMatch[];
  format?: Record<string, unknown> | null;
  onPlayer?: (playerId: string) => void;
  /** default football (SD-70) */
  sport?: SportId;
}) {
  const t = useMemo(() => sportDisciplineTable(sport, matches, format), [sport, matches, format]);
  const [all, setAll] = useState(false);
  if (!t || (!t.rows.length && !t.officials.length)) return null;
  const rows = all ? t.rows : t.rows.slice(0, CAP);
  const plural = sport === 'football' ? 'yellows' : DISCIPLINE_SPECS[sport]?.caution?.plural ?? 'cards';
  const one = plural.replace(/s$/, '');
  const countsText = (c: Record<string, number>) => t.columns.filter((col) => c[col.key]).map((col) => `${c[col.key]} ${col.label.toLowerCase()}`).join(', ') || 'no cards';
  const icons = (c: Record<string, number>) => t.columns.filter((col) => c[col.key]).map((col) => `${c[col.key]}${col.icon}`).join(' ');
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={[textStyles.h3, st.section]}>🟥 Discipline</Text>
      <Text style={textStyles.muted}>{sportRuleText(sport, format)}</Text>
      <Card style={{ gap: 0 }}>
        <View style={[st.row, st.head]}>
          <Text style={[st.h, st.name]}>Player</Text>
          {t.columns.map((c) => <Text key={c.key} style={st.h} accessibilityLabel={c.label}>{c.icon}</Text>)}
        </View>
        {rows.map((r) => (
          <View key={r.key} style={st.row}
            accessibilityLabel={`${r.name}, ${r.teamName}: ${countsText(r.counts)}${r.suspended ? ', suspended for the next match' : ''}`}>
            <View style={st.name}>
              <Text style={st.player} numberOfLines={1} {...playerLink(r.playerId, r.name, onPlayer)}>{r.name}</Text>
              <Text style={st.team} numberOfLines={1}>{r.teamName}</Text>
              {r.suspended ? <Text style={[st.team, st.out]}>{`Suspended for next match${r.banLeft > 1 ? ` (${r.banLeft} left)` : ''}${r.banReason ? ` · ${r.banReason}` : ''}`}</Text>
                : t.banYellows > 1 && r.towardBan === t.banYellows - 1 ? <Text style={[st.team, st.warn]}>{`One more ${one} = ban`}</Text> : null}
            </View>
            {t.columns.map((c) => <Text key={c.key} style={st.n}>{r.counts[c.key] ?? 0}</Text>)}
          </View>
        ))}
      </Card>
      {t.rows.length > CAP && (
        <View style={st.chips}><SelectChip label={all ? 'Show fewer' : `Show all ${t.rows.length}`} active={all} onPress={() => setAll(!all)} /></View>
      )}
      {t.teams.length > 0 && (
        <Text style={textStyles.muted}>
          Cards per team: {t.teams.map((x) => `${x.teamName} ${icons(x.counts)}`).join(' · ')}
        </Text>
      )}
      {t.officials.length > 0 && (
        <Text style={textStyles.muted}>
          Team officials: {t.officials.map((o) => `${o.name} (${o.teamName}) ${icons(o.counts)}`.trim()).join(' · ')}
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginTop: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing(1) },
  head: { minHeight: 28 },
  h: { width: 34, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  name: { flex: 1, minWidth: 0 },
  player: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  team: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  out: { color: theme.colors.danger, fontWeight: '800' },
  warn: { color: theme.colors.accent, fontWeight: '700' },
  n: { width: 34, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
