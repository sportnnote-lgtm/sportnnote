/** SD-70 (FB-12) — a football tournament's discipline table: each carded
 *  player's yellows, second-yellow reds and direct reds, who is out of the
 *  team's next match, the cards per team and team officials' cards. Pure
 *  figures from src/sports/football/discipline.ts. */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, SelectChip, textStyles } from './ui';
import { disciplineTable, disciplineRuleText, readDisciplineRule, type DisciplineMatch } from '../sports/football/discipline';
import { playerLink } from '../sports/playerLink';

const CAP = 8;

export function DisciplineTable({ matches, format, onPlayer }: {
  matches: DisciplineMatch[];
  format?: Record<string, unknown> | null;
  onPlayer?: (playerId: string) => void;
}) {
  const t = useMemo(() => disciplineTable(matches, format), [matches, format]);
  const rule = readDisciplineRule(format);
  const [all, setAll] = useState(false);
  if (!t.rows.length && !t.officials.length) return null;
  const rows = all ? t.rows : t.rows.slice(0, CAP);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={[textStyles.h3, st.section]}>🟥 Discipline</Text>
      <Text style={textStyles.muted}>{disciplineRuleText(rule)}</Text>
      <Card style={{ gap: 0 }}>
        <View style={[st.row, st.head]}>
          <Text style={[st.h, st.name]}>Player</Text>
          <Text style={st.h} accessibilityLabel="Yellow cards">🟨</Text>
          <Text style={st.h} accessibilityLabel="Red cards for a second yellow">2🟨</Text>
          <Text style={st.h} accessibilityLabel="Direct red cards">🟥</Text>
        </View>
        {rows.map((r) => (
          <View key={r.key} style={st.row}
            accessibilityLabel={`${r.name}, ${r.teamName}: ${r.yellows} yellow, ${r.secondYellows} second yellow, ${r.reds} red${r.suspended ? ', suspended for the next match' : ''}`}>
            <View style={st.name}>
              <Text style={st.player} numberOfLines={1} {...playerLink(r.playerId, r.name, onPlayer)}>{r.name}</Text>
              <Text style={st.team} numberOfLines={1}>{r.teamName}</Text>
              {r.suspended ? <Text style={[st.team, st.out]}>{`Suspended for next match${r.banLeft > 1 ? ` (${r.banLeft} left)` : ''}${r.banReason ? ` · ${r.banReason}` : ''}`}</Text>
                : rule.banYellows > 1 && r.yellowsTowardBan === rule.banYellows - 1 ? <Text style={[st.team, st.warn]}>One more yellow = ban</Text> : null}
            </View>
            <Text style={st.n}>{r.yellows}</Text>
            <Text style={st.n}>{r.secondYellows}</Text>
            <Text style={st.n}>{r.reds}</Text>
          </View>
        ))}
      </Card>
      {t.rows.length > CAP && (
        <View style={st.chips}><SelectChip label={all ? 'Show fewer' : `Show all ${t.rows.length}`} active={all} onPress={() => setAll(!all)} /></View>
      )}
      {t.teams.length > 0 && (
        <Text style={textStyles.muted}>
          Cards per team: {t.teams.map((x) => `${x.teamName} ${x.yellows}🟨 ${x.reds}🟥`).join(' · ')}
        </Text>
      )}
      {t.officials.length > 0 && (
        <Text style={textStyles.muted}>
          Team officials: {t.officials.map((o) => `${o.name} (${o.teamName}) ${o.yellows ? `${o.yellows}🟨` : ''}${o.reds ? ` ${o.reds}🟥` : ''}`.trim()).join(' · ')}
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
