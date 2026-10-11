/** SD-141 — "📜 Competition rules" on an event sport's setup screens and hub:
 *  standard or changed, a prompt to check them before the meet starts (until
 *  the organiser has saved them once), and a link to the rules screen. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Button, Card, textStyles } from '../ui';
import { changedRules, ruleValueLabel } from '../../data/results';
import type { Tournament } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CompetitionRulesCard({ tournament, sport }: { tournament: Tournament | null | undefined; sport: string }) {
  const nav = useNavigation<Nav>();
  if (!tournament) return null;
  const fmt = (tournament.formats?.[sport as never] ?? {}) as Record<string, unknown>;
  const changed = changedRules(sport, fmt);
  const reviewed = !!fmt.rulesSetAt;
  return (
    <Card style={[st.card, !reviewed && st.todo]}>
      <View style={st.row}>
        <Text style={[st.title, { flex: 1 }]}>📜 Competition rules</Text>
        <Button label={reviewed ? 'View' : 'Check'} variant="ghost" onPress={() => nav.navigate('CompetitionRules', { tournamentId: tournament.id, sport })} />
      </View>
      <Text style={textStyles.muted} numberOfLines={3}>
        {changed.length
          ? `Your choices: ${changed.slice(0, 3).map((r) => `${r.label.toLowerCase()} — ${ruleValueLabel(r, fmt[r.key])}`).join('; ')}${changed.length > 3 ? ` (+${changed.length - 3} more)` : ''}.`
          : 'Standard rules (federation defaults).'}
        {reviewed ? '' : ' Check them before the meet starts — they lock once results are in.'}
      </Text>
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(1) },
  todo: { borderColor: theme.colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  title: { color: theme.colors.text, fontWeight: '800' },
});
