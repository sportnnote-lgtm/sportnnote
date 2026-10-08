/** Reschedule or postpone an existing match — change its date/time and venue, or
 *  mark it postponed / cancelled, without deleting and recreating it. Host-only;
 *  only for a match that hasn't started (scheduled / postponed / cancelled). */
import React, { useEffect, useState, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, ScreenTitle, FieldLabel, FormError, LoadingState, textStyles } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { VenueField } from '../components/VenueField';
import { ConflictNotice } from '../components/ConflictNotice';
import { getMatch, rescheduleMatch, setMatchStatus, deleteMatch } from '../data/repos';
import { useMatches, useTournamentById } from '../data/hooks';
import { venueOptions } from '../data/tournamentForm';
import { findScheduleConflicts, knownVenueNames } from '../data/scheduleConflicts';
import { readSeriesMeta } from '../data/series';
import type { Match } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function EditMatchScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EditMatch'>>();
  const [match, setMatch] = useState<Match | null | undefined>(undefined); // undefined = loading
  const [when, setWhen] = useState<Date>(new Date());
  const [venue, setVenue] = useState('');
  const [venueUrl, setVenueUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    getMatch(params.matchId).then((m) => {
      if (!live) return;
      setMatch(m ?? null);
      if (m) {
        setWhen(new Date(m.startsAt));
        setVenue(m.venueName ?? '');
        setVenueUrl(m.venueMapsUrl ?? '');
      }
    });
    return () => { live = false; };
  }, [params.matchId]);

  // Reuse chips + clash-detection draw on every other fixture (grounds scoped to
  // this match's tournament). Hooks run before the loading/not-found returns.
  const { matches: allMatches } = useMatches('all');
  // The tournament's own grounds lead the chips (parity #09).
  const tournament = useTournamentById(match?.tournamentId);
  const knownVenues = useMemo(
    () => venueOptions(tournament?.grounds, knownVenueNames(match?.tournamentId ? allMatches.filter((mm) => mm.tournamentId === match.tournamentId) : allMatches)),
    [allMatches, match?.tournamentId, tournament?.grounds]
  );
  const conflicts = useMemo(
    () =>
      match
        ? findScheduleConflicts(
            {
              id: match.id,
              sport: match.sport,
              startsAt: when.toISOString(),
              venueName: venue,
              homeTeamId: match.homeTeam?.id,
              awayTeamId: match.awayTeam?.id,
              homeTeamName: match.homeTeam?.name,
              awayTeamName: match.awayTeam?.name,
            },
            allMatches
          )
        : [],
    [match, when, venue, allMatches]
  );

  if (match === undefined) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><LoadingState label="Loading match…" /></SafeAreaView>;
  }
  if (match === null) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><Text style={st.note}>Match not found.</Text></SafeAreaView>;
  }

  const started = match.status === 'live' || match.status === 'completed';
  const home = match.homeTeam?.name ?? 'Home';
  const away = match.awayTeam?.name ?? 'Away';
  const seriesMeta = readSeriesMeta(match);

  async function saveSchedule() {
    setBusy(true); setError(null);
    try {
      await rescheduleMatch(params.matchId, {
        startsAt: when.toISOString(),
        venueName: venue.trim() || null,
        venueMapsUrl: venueUrl.trim() || null,
      });
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(status: 'scheduled' | 'postponed' | 'cancelled') {
    setBusy(true); setError(null);
    try {
      await setMatchStatus(params.matchId, status);
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the match.');
    } finally {
      setBusy(false);
    }
  }
  async function removeMatch() {
    setBusy(true); setError(null);
    try {
      await deleteMatch(params.matchId);
      nav.popToTop(); // the match is gone — the scoring screen behind us is stale
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the match.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Reschedule match" subtitle={`${home} vs ${away}`} />

        {started ? (
          <Text style={st.note}>This match is already {match.status}. Its date, venue and status can no longer be changed here.</Text>
        ) : (
          <>
            {match.status !== 'scheduled' && (
              <View style={[st.statusBanner, match.status === 'cancelled' ? st.cancelBg : st.postponeBg]}>
                <Text style={st.statusText}>{match.status === 'cancelled' ? '🚫 This match is cancelled.' : '⏸️ This match is postponed.'}</Text>
              </View>
            )}

            <DateTimeField label="Kickoff" value={when} onChange={setWhen} />
            <VenueField venue={venue} onVenue={setVenue} venueUrl={venueUrl} onVenueUrl={setVenueUrl} knownVenues={knownVenues} />
            <Text style={textStyles.muted}>Moving the match just updates this fixture — the rest of the schedule is untouched.</Text>

            <ConflictNotice conflicts={conflicts} />

            <FormError message={error} />
            <Button label={busy ? 'Saving…' : 'Save new date & venue'} onPress={saveSchedule} disabled={busy} />

            <FieldLabel>Status</FieldLabel>
            <View style={st.statusRow}>
              {match.status === 'scheduled' && (
                <>
                  <Button label="⏸️ Postpone" variant="ghost" style={st.flex} disabled={busy} onPress={() => changeStatus('postponed')} />
                  <Button label="🚫 Cancel match" variant="danger" style={st.flex} disabled={busy} onPress={() => changeStatus('cancelled')} />
                </>
              )}
              {match.status === 'postponed' && (
                <>
                  <Button label="▶ Restore to scheduled" variant="home" style={st.flex} disabled={busy} onPress={() => changeStatus('scheduled')} />
                  <Button label="🚫 Cancel match" variant="danger" style={st.flex} disabled={busy} onPress={() => changeStatus('cancelled')} />
                </>
              )}
              {match.status === 'cancelled' && (
                <Button label="▶ Restore to scheduled" variant="home" disabled={busy} onPress={() => changeStatus('scheduled')} />
              )}
            </View>

            {/* Danger zone: hard-delete is only offered pre-match (no scoring data
                to lose). A played match can only be Cancelled, above. */}
            <View style={st.danger}>
              <FieldLabel>Danger zone</FieldLabel>
              {seriesMeta && (
                <Text style={textStyles.muted}>This is leg {seriesMeta.leg} of a {seriesMeta.legs}-match series — deleting removes just this leg.</Text>
              )}
              {!confirmDelete ? (
                <Button label="🗑 Delete match" variant="danger" disabled={busy} onPress={() => setConfirmDelete(true)} />
              ) : (
                <View style={{ gap: theme.spacing(2) }}>
                  <Text style={st.confirmText}>Delete this match permanently? This can’t be undone.</Text>
                  <View style={st.statusRow}>
                    <Button label="Keep" variant="ghost" style={st.flex} disabled={busy} onPress={() => setConfirmDelete(false)} />
                    <Button label={busy ? 'Deleting…' : 'Delete'} variant="danger" style={st.flex} disabled={busy} onPress={removeMatch} />
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  note: { color: theme.colors.textMuted, fontSize: theme.font.body, padding: theme.spacing(4) },
  statusRow: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  statusBanner: { padding: theme.spacing(3), borderRadius: theme.radius.md },
  postponeBg: { backgroundColor: theme.colors.accent + '22' },
  cancelBg: { backgroundColor: theme.colors.danger + '22' },
  statusText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  danger: { gap: theme.spacing(2), marginTop: theme.spacing(4), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing(4) },
  confirmText: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
});
