/**
 * SD-131 — a team / house page's event-sport results (athletics, swimming …):
 * per sport the medals, position points and finals, the latest results (tap →
 * the result sheet) and the records the team holds; and golf stroke-play rounds.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import { getSport } from '../sports/registry';
import { eventWords } from '../sports/eventSports';
import { medalIcon, type TeamEventSportSummary } from '../data/results';
import type { TeamGolfSummary } from '../data/teamEventResults';
import type { SportId } from '../core/types';

const RECORD_WORD: Record<string, string> = { MR: 'Meet record', SR: 'School record' };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function TeamEventResults({ sports, golf, onOpenResult }: {
  sports: TeamEventSportSummary[];
  golf: TeamGolfSummary | null;
  onOpenResult: (phaseId: string) => void;
}) {
  if (!sports.length && !golf) return null;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {sports.map((s) => {
        const sp = getSport(s.sport as SportId);
        return (
          <Card key={s.sport} style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>{sp.icon} {sp.name}</Text>
            <View style={st.tiles} accessible accessibilityLabel={`${s.golds} gold, ${s.silvers} silver, ${s.bronzes} bronze, ${pts(s.points)} points, ${s.finals} finals`}>
              <Tile value={String(s.golds)} label="🥇 Gold" />
              <Tile value={String(s.silvers)} label="🥈 Silver" />
              <Tile value={String(s.bronzes)} label="🥉 Bronze" />
              <Tile value={pts(s.points)} label="Points" />
              <Tile value={String(s.finals)} label={s.finals === 1 ? 'Final' : 'Finals'} />
            </View>
            {s.results.length > 0 && (
              <>
                <Text style={textStyles.muted}>Latest results</Text>
                {s.results.map((r, i) => (
                  <TouchableOpacity key={`${r.phaseId}-${r.name}-${i}`} accessibilityRole="button"
                    accessibilityLabel={`${r.medal ? `${r.medal} ` : `${ordinal(r.position)} `}${r.name}, ${r.event}${r.mark ? `, ${r.mark}` : ''}`}
                    disabled={!r.phaseId} onPress={() => onOpenResult(r.phaseId)} style={st.row}>
                    <Text style={st.place}>{medalIcon(r.medal) || ordinal(r.position)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body} numberOfLines={1}>{r.name}</Text>
                      <Text style={[textStyles.muted, st.small]} numberOfLines={1}>{r.event}{r.tournament ? ` · ${r.tournament}` : ''}</Text>
                    </View>
                    {r.mark ? <Text style={st.mark}>{r.mark}</Text> : null}
                  </TouchableOpacity>
                ))}
              </>
            )}
            {s.records.length > 0 && (
              <>
                <Text style={textStyles.muted}>Records held</Text>
                {s.records.slice(0, 6).map((r, i) => (
                  <View key={`${r.event}-${r.scope}-${i}`} style={st.row}>
                    <Text style={st.place}>⭐</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body} numberOfLines={1}>{r.event}</Text>
                      <Text style={[textStyles.muted, st.small]} numberOfLines={1}>{RECORD_WORD[r.scope] ?? 'Record'} · {r.holder}</Text>
                    </View>
                    <Text style={st.mark}>{r.mark}</Text>
                  </View>
                ))}
              </>
            )}
            {s.results.length === 0 && s.records.length === 0 && (
              <Text style={textStyles.muted}>No {eventWords(s.sport).athletes} placed in a final yet.</Text>
            )}
          </Card>
        );
      })}
      {golf && (
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>{getSport('golf' as SportId).icon} Golf · stroke play</Text>
          <View style={st.tiles}>
            <Tile value={String(golf.rounds)} label={golf.rounds === 1 ? 'Round' : 'Rounds'} />
            <Tile value={String(golf.wins)} label="Round wins" />
            <Tile value={golf.best18 != null ? String(golf.best18) : golf.best9 != null ? String(golf.best9) : '—'} label={golf.best18 == null && golf.best9 != null ? 'Best 9' : 'Best 18'} />
          </View>
        </Card>
      )}
    </View>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={st.tile}>
      <Text style={st.tileValue} numberOfLines={1}>{value}</Text>
      <Text style={[textStyles.muted, st.small]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing(2) },
  tile: { width: '20%', minWidth: 58, flexGrow: 1, alignItems: 'center', gap: 2 },
  tileValue: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  small: { fontSize: theme.font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  place: { width: 32, fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  mark: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
