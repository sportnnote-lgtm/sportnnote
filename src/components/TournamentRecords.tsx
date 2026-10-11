/** SD-51 (GEN-21) — the tournament Records card on the Stats tab: per record
 *  type (chips), the top 5 across the tournament's completed matches from each
 *  match's persisted records block; a row opens its match. Pure ranking in
 *  src/data/tournamentRecords.ts. */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { theme } from '../core/theme';
import { Card, SelectChip, textStyles } from './ui';
import type { Match, SportId } from '../core/types';
import { getSport } from '../sports/registry';
import { tournamentRecords, type RecordRow } from '../data/tournamentRecords';

export function TournamentRecords({ sport, matches, onMatch }: {
  sport: SportId;
  matches: Match[];
  onMatch: (m: Match) => void;
}) {
  const sections = useMemo(
    () => tournamentRecords(sport, matches, { derive: (m) => getSport(m.sport)?.matchRecords?.(m.state as never) ?? null }),
    [sport, matches],
  );
  const [pick, setPick] = useState<string | null>(null);
  if (!sections.length) return null;
  const cur = sections.find((s) => s.type.key === pick) ?? sections[0];
  const byId = new Map(matches.map((m) => [m.id, m]));
  const who = (r: RecordRow): { main: string; sub: string } => {
    const it = r.item;
    if (cur.type.who === 'player' && it.playerName) {
      const pair = it.partnerName ? `${it.playerName} & ${it.partnerName}` : it.playerName;
      return { main: pair, sub: [r.teamName, r.context, it.note].filter(Boolean).join(' · ') };
    }
    if (cur.type.who === 'match' || !r.teamName) return { main: r.context, sub: [it.note, r.date.slice(0, 10)].filter(Boolean).join(' · ') };
    return { main: r.teamName, sub: [r.context, it.note].filter(Boolean).join(' · ') };
  };
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={[textStyles.h3, st.section]}>📜 {getSport(sport).name} records</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        {sections.map((s) => (
          <SelectChip key={s.type.key} label={s.type.label} active={s.type.key === cur.type.key} onPress={() => setPick(s.type.key)} />
        ))}
      </ScrollView>
      <Card style={{ gap: 0 }}>
        {cur.rows.map((r, i) => {
          const m = byId.get(r.matchId);
          const w = who(r);
          return (
            <TouchableOpacity key={`${r.matchId}-${i}`} accessibilityRole="button" activeOpacity={0.8} disabled={!m}
              accessibilityLabel={`${i + 1}. ${w.main}, ${r.item.text}. ${w.sub}. Opens the match.`}
              onPress={() => m && onMatch(m)} style={[st.row, i === cur.rows.length - 1 && st.last]}>
              <Text style={st.rank}>{i + 1}</Text>
              <View style={st.name}>
                <Text style={st.main} numberOfLines={1}>{w.main}</Text>
                {w.sub ? <Text style={st.sub} numberOfLines={2}>{w.sub}</Text> : null}
              </View>
              <Text style={st.val} numberOfLines={2}>{r.item.text}</Text>
            </TouchableOpacity>
          );
        })}
      </Card>
      <Text style={textStyles.muted}>Top {cur.rows.length === 1 ? 'record' : cur.rows.length} from completed matches · tap a row for the match.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginTop: theme.spacing(2) },
  chips: { flexDirection: 'row', gap: theme.spacing(2), paddingRight: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: theme.spacing(2) },
  last: { borderBottomWidth: 0 },
  rank: { width: 18, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  name: { flex: 1, minWidth: 0 },
  main: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  val: { maxWidth: '45%', textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
});
