/**
 * SD-130 — who runs one event (a PE teacher at the long-jump pit, a timekeeper
 * for the 100 m): the event's officials (`host_ids`, PLAYER ids). They enter
 * results, close rounds and lock the final of THIS event — nothing else in the
 * meet. One tap adds a scorer / referee already assigned to the tournament;
 * anyone else by mobile number or name.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { PersonPicker } from '../PersonPicker';
import { getPlayers, getTournamentOfficials } from '../../data/repos';
import { useAuth } from '../../core/auth';
import { tournamentRoleInviteText } from '../../core/inviteText';
import { tournamentLink } from '../../core/shareText';
import type { Tournament } from '../../core/types';

export function EventOfficials({ tournament, value, onChange, title = 'Event officials (optional)', bare = false }: {
  tournament: Tournament | null | undefined;
  value: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  /** inside another card (no card of its own) */
  bare?: boolean;
}) {
  const { profile } = useAuth();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [pool, setPool] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let on = true;
    void (async () => {
      const [ps, offs] = await Promise.all([getPlayers().catch(() => []), tournament?.id ? getTournamentOfficials(tournament.id).catch(() => []) : Promise.resolve([])]);
      if (!on) return;
      setNames(new Map(ps.map((p) => [p.id, p.fullName])));
      setPool([...new Set(offs.map((o) => o.playerId))]);
    })();
    return () => { on = false; };
  }, [tournament?.id]);
  const extra = useMemo(() => pool.filter((id) => !value.includes(id)), [pool, value]);
  const nameOf = (id: string) => names.get(id) ?? 'Official';
  const invite = (name?: string) => tournamentRoleInviteText({ role: 'official', name, inviterName: profile?.fullName, tournamentName: tournament?.name, link: tournament ? tournamentLink(tournament.id) : 'https://app.sportnnote.in' });

  const Box = bare ? View : Card;
  return (
    <Box style={{ gap: theme.spacing(2) }}>
      <Text style={st.title}>{title}</Text>
      <Text style={textStyles.muted}>They can enter results, close rounds and lock the final of this event only. Organisers can always run every event.</Text>
      {value.length > 0 && (
        <View style={st.chips}>
          {value.map((id) => <SelectChip key={id} label={`✓ ${nameOf(id)}  ✕`} active onPress={() => onChange(value.filter((x) => x !== id))} />)}
        </View>
      )}
      {extra.length > 0 && (
        <View style={st.chips}>
          {extra.map((id) => <SelectChip key={id} label={`＋ ${nameOf(id)}`} active={false} onPress={() => onChange([...value, id])} />)}
        </View>
      )}
      {adding ? (
        <PersonPicker role="official" excludeIds={value} inviteText={invite}
          onPick={(p) => { setNames((m) => new Map(m).set(p.id, p.fullName)); onChange([...new Set([...value, p.id])]); setAdding(false); }} />
      ) : (
        <SelectChip label="＋ Someone else (mobile or name)" active={false} onPress={() => setAdding(true)} />
      )}
    </Box>
  );
}

const st = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
