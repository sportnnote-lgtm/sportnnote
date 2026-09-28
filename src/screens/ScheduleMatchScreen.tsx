/** Schedule a match: choose sport → home & away teams (filtered to that sport)
 *  → kickoff time. Creates a 'scheduled' match in the demo store or Supabase.
 *  Sport is a compact picklist; teams lead with the ones you've played for and
 *  fall back to a search (type 3+ letters) so the list never sprawls. */
import React, { useState, useMemo } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { SportFormatEditor, defaultsFor, type FormatVal } from '../components/FormatEditor';
import { VenueField } from '../components/VenueField';
import { ConflictNotice } from '../components/ConflictNotice';
import { ClubQuickPick } from '../components/ClubQuickPick';
import { SPORT_LIST, getSport, participantMode, type ParticipantMode } from '../sports/registry';
import { useTeams, useMatches } from '../data/hooks';
import { findScheduleConflicts, knownVenueNames } from '../data/scheduleConflicts';
import { createMatch, createTeam, createReplacementPlayer, getMyPlayerId, setMatchScorer } from '../data/repos';
import { useAuth } from '../core/auth';
import { KO_STAGES, KO_STAGE_LABEL, isKoStage, type KoStage } from '../data/bracket';
import type { SportId, Team } from '../core/types';

// What phase of the tournament a match belongs to. 'league' = a plain
// table/round-robin game (no tag); 'group' = a group-stage game (needs a group
// letter); the rest are knockout stages. Drives the standings/bracket views.
type Phase = 'league' | 'group' | KoStage;
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type PickTeam = Pick<Team, 'id' | 'name' | 'colorHex'>;

// For teams created on the fly (a friendly between two ad-hoc sides): auto-derive a
// short code from the name and cycle a color so each new team looks distinct.
const TEAM_PALETTE = ['#FF5C5C', '#4DA3FF', '#4CD964', '#FFD60A', '#BF5AF2', '#FF9F0A', '#5AC8FA', '#FF375F'];
const shortFrom = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  return ((initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'TM').slice(0, 4);
};

export default function ScheduleMatchScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'ScheduleMatch'>>();
  // No tournament → this is an ad-hoc friendly: kicks off now and jumps straight
  // into the live scorer once created.
  const tournamentId = route.params?.tournamentId;
  const isFriendly = !tournamentId;
  const { profile } = useAuth();

  // No sport chosen yet → the picker reads "Select a sport" and the rest of the
  // form (teams, format) stays hidden until one is picked.
  const [sport, setSport] = useState<SportId | null>(route.params?.sport ?? null);
  const [teamNonce, setTeamNonce] = useState(0); // bump to refetch after creating a team on the fly
  const teams = useTeams(sport ?? undefined, teamNonce);
  const [home, setHome] = useState<string | null>(null);
  const [away, setAway] = useState<string | null>(null);

  const [when, setWhen] = useState(() => {
    const d = new Date();
    if (!route.params?.tournamentId) return d; // friendly → kicks off now
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d;
  });
  const [venue, setVenue] = useState('');
  const [venueUrl, setVenueUrl] = useState('');
  const [stream, setStream] = useState('');
  // Which phase this match belongs to (tournament matches only) — lets an
  // organizer hand-tag a group game or a specific knockout tie (e.g. a Final).
  const [phase, setPhase] = useState<Phase>('league');
  const [groupLabel, setGroupLabel] = useState('A');
  // Per-match rules — seeded from the sport's defaults so casual users can ignore it.
  const [format, setFormat] = useState<Record<string, FormatVal>>(
    () => (route.params?.sport ? defaultsFor(getSport(route.params.sport).formatFields ?? []) : {})
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A friendly kicking off ~now jumps straight into the scorer; one set for later
  // is just filed as scheduled (it shows under Upcoming, like any planned match).
  const isImmediate = isFriendly && when.getTime() <= Date.now() + 120_000;

  // Clash-detection + venue reuse draw on every other fixture. Grounds already
  // used in this tournament (or, for a friendly, anywhere) become reuse chips so
  // they're named consistently; the same fixtures feed conflict checks.
  const { matches: allMatches } = useMatches('all');
  const knownVenues = useMemo(
    () => knownVenueNames(tournamentId ? allMatches.filter((mm) => mm.tournamentId === tournamentId) : allMatches),
    [allMatches, tournamentId]
  );
  const homeTeam = teams.find((t) => t.id === home);
  const awayTeam = teams.find((t) => t.id === away);
  const conflicts = useMemo(
    () =>
      sport
        ? findScheduleConflicts(
            {
              sport,
              startsAt: when.toISOString(),
              venueName: venue,
              homeTeamId: home,
              awayTeamId: away,
              homeTeamName: homeTeam?.name,
              awayTeamName: awayTeam?.name,
            },
            allMatches
          )
        : [],
    [sport, when, venue, home, away, homeTeam?.name, awayTeam?.name, allMatches]
  );

  function pickSport(s: SportId) {
    setSport(s);
    setHome(null);
    setAway(null);
    setFormat(defaultsFor(getSport(s).formatFields ?? []));
  }

  // Create a brand-new side (team / pair / individual) from a typed name and
  // select it. Individuals and pairs ride on the same ad-hoc-team plumbing — the
  // UI just calls them a "player" or "pair", never a team.
  const makeCreateHandler = (side: 'home' | 'away') => async (name: string): Promise<boolean> => {
    if (!sport) return false;
    try {
      const team = await createTeam({ name, shortName: shortFrom(name), sport, colorHex: TEAM_PALETTE[teams.length % TEAM_PALETTE.length], adhoc: true });
      setTeamNonce((n) => n + 1); // refetch so it shows in both pickers
      (side === 'home' ? setHome : setAway)(team.id);
      return true;
    } catch {
      setError('Could not create the side.');
      return false;
    }
  };

  // Doubles: create a pair as a team of the two named partners (real player rows
  // in roster order), so the scorer can see and rotate each server by name.
  const makePairCreateHandler = (side: 'home' | 'away') => async (a: string, b: string): Promise<boolean> => {
    if (!sport) return false;
    try {
      // Both partners carry the pair name as their "house" so the scoring roster
      // resolves them (getRoster matches by house name, in demo and live alike).
      const name = `${a.trim()} / ${b.trim()}`;
      const [pa, pb] = await Promise.all([
        createReplacementPlayer(a.trim(), sport, name),
        createReplacementPlayer(b.trim(), sport, name),
      ]);
      const team = await createTeam({
        name, shortName: shortFrom(`${a} ${b}`), sport,
        colorHex: TEAM_PALETTE[teams.length % TEAM_PALETTE.length], adhoc: true,
        roster: [pa.id, pb.id],
      });
      setTeamNonce((n) => n + 1);
      (side === 'home' ? setHome : setAway)(team.id);
      return true;
    } catch {
      setError('Could not create the pair.');
      return false;
    }
  };

  // "Me" quick-pick for individual sports: reuse an existing side named after the
  // signed-in user if one exists, else create it. So a player scoring their own
  // match taps once instead of typing their name.
  const pickMe = (side: 'home' | 'away') => async () => {
    if (!sport || !profile?.fullName) return;
    const mine = teams.find((t) => t.name.toLowerCase() === profile.fullName.toLowerCase());
    if (mine) { (side === 'home' ? setHome : setAway)(mine.id); return; }
    await makeCreateHandler(side)(profile.fullName);
  };

  // Singles ⇄ Doubles for racket sports. Flipping the structure clears both sides
  // (a singles pick isn't a doubles pick) and updates playersPerSide.
  const setStructure = (playersPerSide: number) => {
    setFormat((f) => ({ ...f, playersPerSide }));
    setHome(null);
    setAway(null);
  };

  async function submit() {
    if (!sport) return setError('Pick a sport.');
    const noun = mode === 'individual' ? 'players' : mode === 'pairs' ? 'pairs' : 'teams';
    if (!home || !away) return setError(`Pick both ${noun}.`);
    if (home === away) return setError(`The two ${noun} must differ.`);
    setError(null);
    setBusy(true);
    try {
      const myId = await getMyPlayerId(profile?.id);
      const created = await createMatch({
        tournamentId,
        sport,
        homeTeamId: home,
        awayTeamId: away,
        // Phase tags (tournament matches only): a group game carries its group +
        // stage:'group'; a knockout tie carries its stage; a league game neither.
        group: !isFriendly && phase === 'group' ? groupLabel.trim().toUpperCase() || 'A' : undefined,
        stage: isFriendly ? undefined : isKoStage(phase) ? phase : phase === 'group' ? 'group' : undefined,
        startsAt: when.toISOString(),
        venueName: venue.trim() || undefined,
        venueMapsUrl: venueUrl.trim() || undefined,
        hostIds: myId ? [myId] : [],
        format,
        streamUrl: stream.trim() || undefined,
      });
      // For a friendly, the creator is the scorer by default — whether they score
      // it now or scheduled it for later. Without this, a scheduled friendly opened
      // later has no scorer, so the Scoring tab (scorer-only) never appears and the
      // creator can't work out how to score their own match. They can hand off from
      // the Info tab anytime. (Tournament matches are left unassigned — the organizer
      // schedules many they won't personally score.)
      if (isFriendly && myId) await setMatchScorer(created.id, myId);
      // A "now" friendly jumps straight into scoring (replace so Back skips the
      // form); a friendly set for later just files as scheduled → Upcoming.
      if (isImmediate) {
        nav.replace('LiveScoring', {
          matchId: created.id, sport,
          homeName: created.homeTeam.shortName, awayName: created.awayTeam.shortName,
          homeTeamName: created.homeTeam.name, awayTeamName: created.awayTeam.name,
          homeColor: created.homeTeam.colorHex, awayColor: created.awayTeam.colorHex,
          canScore: true,
        });
      } else {
        nav.goBack();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule match');
    } finally {
      setBusy(false);
    }
  }

  // How the two sides are picked for this sport + format: two teams, two
  // individuals (Singles), or two pairs (Doubles).
  const mode: ParticipantMode = sport ? participantMode(sport, format) : 'team';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          title={isFriendly ? 'Start a friendly' : 'Schedule a match'}
          subtitle={isFriendly ? 'A quick game — no tournament needed' : 'Pick sport, teams & time'}
        />

        <SportPicker sport={sport} onPick={pickSport} />

        {sport && (
          <>
            {/* Racket sports pick their structure first — Singles (one player a
                side) or Doubles (a pair) — so the participant picker below adapts. */}
            {getSport(sport).participantKind === 'both' && (
              <View style={{ gap: theme.spacing(2) }}>
                <FieldLabel>Format</FieldLabel>
                <View style={st.chips}>
                  <SelectChip label="👤 Singles" active={mode === 'individual'} onPress={() => setStructure(1)} />
                  <SelectChip label="👥 Doubles" active={mode === 'pairs'} onPress={() => setStructure(2)} />
                </View>
              </View>
            )}

            {mode === 'team' ? (
              <>
                {sport && (
                  <ClubQuickPick
                    sport={sport}
                    selectedTeamIds={[home, away].filter(Boolean) as string[]}
                    onPicked={(team) => {
                      // Fill the first empty side; ignore a duplicate of the other side.
                      if (!home) setHome(team.id);
                      else if (!away && team.id !== home) setAway(team.id);
                      setTeamNonce((n) => n + 1);
                    }}
                  />
                )}
                <TeamPicker noun="team" label="Home team" teams={teams} selected={home} onSelect={setHome} onClear={() => setHome(null)} onCreate={makeCreateHandler('home')} />
                <TeamPicker noun="team" label="Away team" teams={teams} selected={away} onSelect={setAway} onClear={() => setAway(null)} onCreate={makeCreateHandler('away')} />
              </>
            ) : mode === 'individual' ? (
              <>
                <TeamPicker noun="player" label="Player 1" teams={teams} selected={home} onSelect={setHome} onClear={() => setHome(null)} onCreate={makeCreateHandler('home')} onPickMe={pickMe('home')} meName={profile?.fullName} />
                <TeamPicker noun="player" label="Player 2" teams={teams} selected={away} onSelect={setAway} onClear={() => setAway(null)} onCreate={makeCreateHandler('away')} />
              </>
            ) : (
              <>
                <Text style={textStyles.muted}>A doubles side is a pair of two players. Pick an existing pair, or name both partners.</Text>
                <TeamPicker noun="pair" label="Pair 1" teams={teams} selected={home} onSelect={setHome} onClear={() => setHome(null)} onCreate={makeCreateHandler('home')} onCreatePair={makePairCreateHandler('home')} />
                <TeamPicker noun="pair" label="Pair 2" teams={teams} selected={away} onSelect={setAway} onClear={() => setAway(null)} onCreate={makeCreateHandler('away')} onCreatePair={makePairCreateHandler('away')} />
              </>
            )}

            <DateTimeField label="Kickoff" value={when} onChange={setWhen} />

            {/* Phase tag — only for tournament matches. Lets an organizer place a
                match precisely: a group game, or a specific knockout tie that then
                shows in the right round of the bracket. */}
            {!isFriendly && (
              <View style={{ gap: theme.spacing(2) }}>
                <FieldLabel>Stage</FieldLabel>
                <View style={st.chips}>
                  <SelectChip label="League" active={phase === 'league'} onPress={() => setPhase('league')} />
                  <SelectChip label="👥 Group" active={phase === 'group'} onPress={() => setPhase('group')} />
                  {KO_STAGES.map((s) => (
                    <SelectChip key={s} label={KO_STAGE_LABEL[s]} active={phase === s} onPress={() => setPhase(s)} />
                  ))}
                </View>
                {phase === 'group' && (
                  <TextField label="Group" value={groupLabel} onChange={(t) => setGroupLabel(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase())} placeholder="A" autoCapitalize="characters" />
                )}
              </View>
            )}

            {(getSport(sport).formatFields ?? []).length > 0 && (
              <SportFormatEditor
                sport={sport}
                value={format}
                onChange={(k, v) => setFormat((f) => ({ ...f, [k]: v }))}
                // Singles/Doubles is chosen up front for racket sports, so don't repeat it here.
                omitKeys={getSport(sport).participantKind === 'both' ? ['playersPerSide'] : undefined}
              />
            )}
          </>
        )}

        <VenueField venue={venue} onVenue={setVenue} venueUrl={venueUrl} onVenueUrl={setVenueUrl} knownVenues={knownVenues} />

        <ConflictNotice conflicts={conflicts} />

        <TextField
          label="Live stream link (optional)"
          value={stream}
          onChange={setStream}
          placeholder="youtu.be/… · youtube.com/live/… · twitch.tv/…"
          autoCapitalize="none"
        />
        <Text style={textStyles.muted}>
          Add a YouTube or Twitch link and it shows at the top of the live match. You can also set or change it later from the match’s Info tab.
        </Text>

        <FormError message={error} />
        <Button
          label={
            busy
              ? isImmediate ? 'Starting…' : 'Scheduling…'
              : isFriendly
                ? isImmediate ? '▶ Create & score now' : '📅 Schedule friendly'
                : 'Schedule match'
          }
          onPress={submit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Compact sport picklist — a field that opens an inline list, instead of a
 *  10-chip wall. */
function SportPicker({ sport, onPick }: { sport: SportId | null; onPick: (s: SportId) => void }) {
  const [open, setOpen] = useState(false);
  const cur = sport ? getSport(sport) : null;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel>Sport</FieldLabel>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={cur ? `Sport: ${cur.name}` : 'Select a sport'} accessibilityState={{ expanded: open }} activeOpacity={0.8} style={st.field} onPress={() => setOpen((o) => !o)}>
        <Text style={[st.fieldValue, !cur && st.fieldPlaceholder]}>{cur ? `${cur.icon}  ${cur.name}` : 'Select a sport'}</Text>
        <Text style={st.caret}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={st.dropdown}>
          {SPORT_LIST.map((s) => (
            <TouchableOpacity accessibilityRole="button"
              key={s.id}
              activeOpacity={0.7}
              style={[st.option, s.id === sport && st.optionActive]}
              onPress={() => { onPick(s.id); setOpen(false); }}
            >
              <Text style={st.optionText}>{s.icon}  {s.name}</Text>
              {s.id === sport && <Text style={st.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/** One side of a match. `noun` sets every user-facing word — a team, a pair
 *  (doubles) or a player (singles) — so an individual sport never says "team".
 *  All three still resolve to a side id under the hood. `onPickMe` adds a
 *  one-tap "Me" chip for individual sports. */
function TeamPicker({
  label,
  noun = 'team',
  teams,
  selected,
  onSelect,
  onClear,
  onCreate,
  onCreatePair,
  onPickMe,
  meName,
}: {
  label: string;
  noun?: 'team' | 'pair' | 'player';
  teams: PickTeam[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  /** create a brand-new side from a typed name; returns true if it succeeded */
  onCreate: (name: string) => Promise<boolean>;
  /** doubles pairs: create from two partner names (as a 2-player roster) */
  onCreatePair?: (a: string, b: string) => Promise<boolean>;
  /** individual sports only: one-tap select the signed-in user */
  onPickMe?: () => void;
  meName?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameB, setNameB] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const selectedTeam = teams.find((t) => t.id === selected);
  const q = query.trim().toLowerCase();
  // Search kicks in at 3+ letters.
  const results = q.length >= 3 ? teams.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 25) : [];

  const searchPlaceholder = noun === 'player' ? 'Search players (type 3+ letters)…' : noun === 'pair' ? 'Search pairs (type 3+ letters)…' : 'Search all teams (type 3+ letters)…';
  const createPlaceholder = noun === 'player' ? 'e.g. Rafael Nadal' : noun === 'pair' ? 'e.g. Nadal / Alcaraz' : 'e.g. Sunday FC';
  const meFirst = meName ? meName.trim().split(/\s+/)[0] : 'Me';

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate(name.trim());
    setBusy(false);
    if (ok) { setName(''); setCreating(false); setQuery(''); }
  };
  const createPair = async () => {
    if (!name.trim() || !nameB.trim() || busy || !onCreatePair) return;
    setBusy(true);
    const ok = await onCreatePair(name.trim(), nameB.trim());
    setBusy(false);
    if (ok) { setName(''); setNameB(''); setCreating(false); setQuery(''); }
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>{label}</Text>

      {selectedTeam ? (
        <View style={st.selectedRow}>
          <SelectChip label={selectedTeam.name} dotColor={selectedTeam.colorHex} active onPress={onClear} />
          <Text style={st.changeLink} onPress={onClear}>Change</Text>
        </View>
      ) : (
        <>
          {onPickMe && (
            <SelectChip label={`👤 ${meFirst} (me)`} active={false} onPress={onPickMe} />
          )}
          {!creating && (
            <>
              <TextField label="" value={query} onChange={setQuery} placeholder={searchPlaceholder} autoCapitalize="none" />
              {q.length > 0 && q.length < 3 && <Text style={st.tinyLabel}>Keep typing…</Text>}
              {results.length > 0 && (
                <View style={st.chips}>
                  {results.map((t) => (
                    <SelectChip key={t.id} label={t.name} dotColor={t.colorHex} active={false} onPress={() => onSelect(t.id)} />
                  ))}
                </View>
              )}
              {q.length >= 3 && results.length === 0 && (
                <Text style={textStyles.muted}>No {noun}s match “{query.trim()}”. Create one below.</Text>
              )}
            </>
          )}

          <SelectChip label={`＋ New ${noun}`} active={creating} onPress={() => setCreating((c) => !c)} />
          {creating && (onCreatePair ? (
            <View style={{ gap: theme.spacing(2) }}>
              <TextField label="Player 1" value={name} onChange={setName} placeholder="e.g. Rafael Nadal" />
              <TextField label="Player 2" value={nameB} onChange={setNameB} placeholder="e.g. Carlos Alcaraz" />
              <Button label={busy ? 'Creating…' : '＋ Create pair'} onPress={createPair} disabled={busy || !name.trim() || !nameB.trim()} />
            </View>
          ) : (
            <View style={{ gap: theme.spacing(2) }}>
              <TextField label={`New ${noun} name`} value={name} onChange={setName} placeholder={createPlaceholder} />
              <Button label={busy ? 'Creating…' : '＋ Create & select'} onPress={create} disabled={busy || !name.trim()} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tinyLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  // compact select field + dropdown (sport picklist)
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3),
  },
  fieldValue: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  fieldPlaceholder: { color: theme.colors.textMuted, fontWeight: '400' },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  dropdown: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  optionActive: { backgroundColor: theme.colors.surfaceAlt },
  optionText: { color: theme.colors.text, fontSize: theme.font.body },
  check: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  changeLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
