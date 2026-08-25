/** A one-line status of a tournament's registration — open (with spots left),
 *  closed, deadline passed, or full — plus a below-minimum heads-up. Shown to the
 *  organizer on the participants screen and to teams deciding whether to join. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { formatShort, useUserTimeZone } from '../core/time';
import { registrationState } from '../core/registration';
import type { Tournament } from '../core/types';

export function RegistrationBanner({ tournament, enteredCount, nowMs }: {
  tournament: Pick<Tournament, 'isOpen' | 'registrationDeadline' | 'minTeams' | 'maxTeams'>;
  enteredCount: number;
  nowMs?: number;
}) {
  const tz = useUserTimeZone();
  const st = registrationState(tournament, enteredCount, nowMs ?? Date.now());
  // Nothing to say for a plain invite-only tournament with no bounds set.
  if (!tournament.isOpen && !tournament.maxTeams && !tournament.minTeams && !tournament.registrationDeadline) return null;

  const tint = st.open ? theme.colors.primary : theme.colors.textMuted;
  const icon = st.open ? '🟢' : st.reason === 'full' ? '🔴' : '🔒';
  return (
    <View style={[styles.wrap, { borderColor: tint + '55', backgroundColor: tint + '14' }]}>
      <Text style={[styles.line, { color: tint }]}>{icon} {st.label}</Text>
      {tournament.registrationDeadline && st.open && (
        <Text style={styles.sub}>Closes {formatShort(tournament.registrationDeadline, tz)}</Text>
      )}
      {st.belowMin && tournament.minTeams != null && (
        <Text style={styles.warn}>⚠️ Below the {tournament.minTeams}-team minimum — {tournament.minTeams - enteredCount} more needed for a viable field.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: theme.radius.md, padding: theme.spacing(3), gap: theme.spacing(1) },
  line: { fontSize: theme.font.small, fontWeight: '800' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
  warn: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700' },
});
