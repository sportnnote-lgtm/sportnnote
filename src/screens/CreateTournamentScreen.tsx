/** Create a tournament: name, dates, sports, the competition structure, and the
 *  per-sport format (overs, players-a-side, sub rules…) the organizer chooses —
 *  all games in the tournament then follow that format. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { DateField, DateTimeField } from '../components/DateTimeField';
import { TouchableOpacity } from 'react-native';
import { MedalScoringEditor } from '../components/MedalScoringEditor';
import { SportSettingsButtons, coarseStructureFrom } from '../components/SportSettingsButtons';
import { tournamentDraft } from '../data/tournamentDraft';
import { defaultsFor } from '../components/FormatEditor';
import { withNewTournamentPoints } from '../data/standings';
import { CoHostPicker, type CoHost } from '../components/CoHostPicker';
import { DivisionsEditor } from '../components/DivisionsEditor';
import type { NewTournamentCategory } from '../core/types';
import { LEAD_OPTIONS, DEFAULT_LEAD_MINUTES } from '../data/reminderPrefs';
import { SPORT_LIST, getSport } from '../sports/registry';
import { createTournament, getMyPlayerId, getPlayer } from '../data/repos';
import { useAuth } from '../core/auth';
import { notice } from '../core/confirm';
import { useMatches, useOrganizations } from '../data/hooks';
import { knownVenueNames } from '../data/scheduleConflicts';
import { categoryFromOrgType } from '../data/tournamentForm';
import {
  TournamentImagesField, TournamentPlaceFields, SportBasics, TournamentContactFields,
  emptyDetails, detailsPayload, type DetailsValue,
} from '../components/TournamentDetailsFields';
import { organizableOrgsForPlayer } from '../core/org';
import type { SportId, TournamentStructure, TournamentScoring, TournamentParticipation } from '../core/types';

const PARTICIPATION_OPTS: { key: TournamentParticipation; label: string; hint: string }[] = [
  { key: 'open', label: '🏳️ Open teams', hint: 'Any teams you register compete.' },
  { key: 'inter_house', label: '🏠 Inter-house', hint: 'A school’s Houses compete; players play for their House.' },
  { key: 'school_team', label: '🏫 School team', hint: 'The school’s own team represents it.' },
  { key: 'individual', label: '👤 Individuals', hint: 'Players enter individually (no teams).' },
];
import type { FormatField } from '../sports/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FormatVal = number | string | boolean;
type FormatMap = Partial<Record<SportId, Record<string, FormatVal>>>;


// Dates are plain YYYY-MM-DD strings; these keep defaults future-relative and
// validate what the organizer types (order + real calendar dates).
const pad = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isValidISODate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toISODate(d) === s; // rejects rollovers like 2026-13-40
};

export default function CreateTournamentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CreateTournament'>>();
  const initialSport = params?.sport;
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [name, setName] = useState('');
  // Host = the creator ("self") or one of the orgs they belong to.
  const [myId, setMyId] = useState<string | null>(null);
  // The creator's real name — never a placeholder like "You", which would be saved
  // as the tournament's host name and shown to everyone.
  const [myName, setMyName] = useState(profile?.fullName ?? '');
  const [hostChoice, setHostChoice] = useState<'self' | string>(params?.orgId ?? 'self');
  const [participation, setParticipation] = useState<TournamentParticipation>('open');
  const [coHosts, setCoHosts] = useState<CoHost[]>([]);
  const [divisions, setDivisions] = useState<NewTournamentCategory[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [regDeadline, setRegDeadline] = useState<Date | null>(null);
  const [minTeams, setMinTeams] = useState(0);
  const [maxTeams, setMaxTeams] = useState(0);
  // Tournament details (parity #09). Images are uploaded by the picker and kept
  // here until the tournament is created.
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [bannerUrl, setBannerUrl] = useState<string | undefined>(undefined);
  const [details, setDetails] = useState<DetailsValue>(emptyDetails);
  // City/category prefill from the host org until the organiser edits them.
  const touched = React.useRef({ city: false, category: false, phone: false });
  const patchDetails = (p: Partial<DetailsValue>) => {
    if ('city' in p) touched.current.city = true;
    if ('eventCategory' in p) touched.current.category = true;
    if ('organiserPhone' in p) touched.current.phone = true;
    setDetails((d) => ({ ...d, ...p }));
  };
  const { matches: allMatches } = useMatches();
  const knownVenues = React.useMemo(() => knownVenueNames(allMatches), [allMatches]);
  React.useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then(async (id) => {
      if (!on || !id) return;
      setMyId(id);
      const p = await getPlayer(id);
      if (on && p) {
        setMyName(p.fullName);
        if (p.phone && !touched.current.phone) setDetails((d) => ({ ...d, organiserPhone: p.phone ?? '' }));
      }
    });
    return () => { on = false; };
  }, [profile?.id]);
  // Only communities where you're an Admin or Organizer can host your event.
  const myOrgs = organizableOrgsForPlayer(orgs, myId);
  const hostOrg = hostChoice !== 'self' ? myOrgs.find((o) => o.id === hostChoice) : undefined;
  React.useEffect(() => {
    setDetails((d) => ({
      ...d,
      city: touched.current.city ? d.city : (hostOrg?.city ?? ''),
      eventCategory: touched.current.category ? d.eventCategory : categoryFromOrgType(hostOrg?.type),
    }));
  }, [hostOrg?.id, hostOrg?.city, hostOrg?.type]);
  const [start, setStart] = useState(() => toISODate(new Date()));
  const [end, setEnd] = useState(() => toISODate(addDays(new Date(), 5)));
  const [sports, setSports] = useState<SportId[]>(initialSport ? [initialSport] : []);
  const [scoring, setScoring] = useState<TournamentScoring | undefined>(undefined);
  const [formats, setFormats] = useState<FormatMap>(
    // A new tournament starts on each sport's international points system (D1).
    initialSport ? { [initialSport]: withNewTournamentPoints(initialSport, defaultsFor(getSport(initialSport).formatFields ?? [], 'tournament')) } : {}
  );
  // Per-sport settings live on their own screens via the shared draft — seed it
  // once with the initial defaults, and pull edits back when we return.
  useEffect(() => { tournamentDraft.seed(formats); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { setFormats(tournamentDraft.all() as FormatMap); }, []));
  // Reminders: by default every player uses their own settings; the organizer can
  // set custom lead times that apply to everyone playing in this tournament.
  const [customReminders, setCustomReminders] = useState(false);
  const [reminderMins, setReminderMins] = useState<number[]>([...DEFAULT_LEAD_MINUTES]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleSport = (s: SportId) =>
    setSports((prev) => {
      if (prev.includes(s)) {
        setFormats((f) => { const { [s]: _, ...rest } = f; tournamentDraft.setFormat(s, {}); return rest; });
        return prev.filter((x) => x !== s);
      }
      const fields = getSport(s).formatFields ?? [];
      const seeded = withNewTournamentPoints(s, fields.length ? defaultsFor(fields, 'tournament') : {});
      setFormats((f) => ({ ...f, [s]: seeded }));
      tournamentDraft.setFormat(s, seeded);
      return [...prev, s];
    });

  async function submit() {
    if (!name.trim()) return setError('Give the tournament a name.');
    if (sports.length === 0) return setError('Pick at least one sport.');
    const s = start.trim(), e = end.trim();
    if (!isValidISODate(s)) return setError('Enter a valid start date as YYYY-MM-DD.');
    if (!isValidISODate(e)) return setError('Enter a valid end date as YYYY-MM-DD.');
    if (e < s) return setError('End date must be on or after the start date.'); // ISO strings sort chronologically
    setError(null);
    setBusy(true);
    try {
      const chosenOrg = hostChoice !== 'self' ? myOrgs.find((o) => o.id === hostChoice) : undefined;
      const finalFormats = { ...tournamentDraft.all() } as FormatMap;
      const created = await createTournament({
        name: name.trim(),
        hostName: chosenOrg ? chosenOrg.name : (myName || profile?.fullName || 'Organiser'),
        hostOrgId: chosenOrg?.id,
        isOpen,
        registrationDeadline: isOpen && regDeadline ? regDeadline.toISOString() : undefined,
        minTeams: isOpen && minTeams > 0 ? minTeams : undefined,
        maxTeams: isOpen && maxTeams > 0 ? maxTeams : undefined,
        sports,
        startDate: s, endDate: e,
        formats: finalFormats,
        structure: coarseStructureFrom(finalFormats, sports),
        scoring: sports.length > 1 ? scoring : undefined,
        participation: participation !== 'open' ? participation : undefined,
        reminderLeadMinutes: customReminders ? reminderMins : undefined,
        coHostIds: coHosts.map((c) => c.id),
        categories: divisions.length ? divisions : undefined,
        logoUrl, bannerUrl,
        ...detailsPayload(details),
      });
      if (created.profileSaved === false) notice('Saved', 'Banner, grounds and contact will save after the server update.');
      // Straight to the admin hub with the setup checklist (parity #08).
      nav.replace('Tournament', { tournamentId: created.id, tab: 'Settings' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create tournament');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="New tournament" subtitle="Set up your meet & its format" />
        <TournamentImagesField logoUrl={logoUrl} bannerUrl={bannerUrl} onLogo={setLogoUrl} onBanner={setBannerUrl} />
        <TextField label="Name" value={name} onChange={setName} placeholder="Annual Sports Meet 2026" />
        <TournamentPlaceFields value={details} onChange={patchDetails} knownVenues={knownVenues} />

        <FieldLabel>Host</FieldLabel>
        <View style={st.chips}>
          <SelectChip label={myName ? `🙋 Myself (${myName})` : '🙋 Myself'} active={hostChoice === 'self'} onPress={() => setHostChoice('self')} />
          {myOrgs.map((o) => (
            <SelectChip key={o.id} label={`🏛️ ${o.name}`} active={hostChoice === o.id} onPress={() => setHostChoice(o.id)} />
          ))}
        </View>
        <Text style={st.hint}>
          {hostChoice === 'self'
            ? 'You host this tournament personally.'
            : 'Everyone in this organization can manage it and gets host reminders.'}
        </Text>

        <FieldLabel>Contested by</FieldLabel>
        <View style={st.chips}>
          {PARTICIPATION_OPTS.map((o) => (
            <SelectChip key={o.key} label={o.label} active={participation === o.key} onPress={() => setParticipation(o.key)} />
          ))}
        </View>
        <Text style={st.hint}>{PARTICIPATION_OPTS.find((o) => o.key === participation)?.hint}</Text>

        {/* Add other people as co-hosts — look them up, or invite them to install. */}
        <CoHostPicker
          value={coHosts}
          onChange={setCoHosts}
          inviterName={myName}
          excludeIds={myId ? [myId] : []}
          context={name.trim() || undefined}
        />

        {/* Divisions (age × gender) — school meets run many at once. Optional. */}
        <DivisionsEditor value={divisions} onChange={setDivisions} />


        <View style={st.row}>
          <View style={st.flex}><DateField label="Start date" value={start} onChange={setStart} /></View>
          <View style={st.flex}><DateField label="End date" value={end} onChange={setEnd} /></View>
        </View>

        <FieldLabel>Sports</FieldLabel>
        <View style={st.chips}>
          {SPORT_LIST.map((s) => (
            <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sports.includes(s.id)} onPress={() => toggleSport(s.id)} />
          ))}
        </View>

        {sports.length > 1 && <MedalScoringEditor sports={sports} value={scoring} onChange={setScoring} />}

        {/* Singles vs Doubles up front for racket sports — the first thing that
            shapes the whole competition (individuals vs pairs), so it's not buried
            in per-sport settings. */}
        {sports.filter((s) => getSport(s).participantKind === 'both').map((s) => {
          const pps = Number((formats[s] as Record<string, unknown> | undefined)?.playersPerSide ?? 1);
          const setPps = (n: number) => { tournamentDraft.setField(s, 'playersPerSide', n); setFormats(tournamentDraft.all() as FormatMap); };
          return (
            <View key={s} style={{ gap: theme.spacing(2) }}>
              <FieldLabel>{getSport(s).icon} {getSport(s).name} — format</FieldLabel>
              <View style={st.chips}>
                <SelectChip label="👤 Singles" active={pps < 2} onPress={() => setPps(1)} />
                <SelectChip label="👥 Doubles (pairs)" active={pps >= 2} onPress={() => setPps(2)} />
              </View>
            </View>
          );
        })}

        <SportBasics sports={sports} onChanged={() => setFormats(tournamentDraft.all() as FormatMap)} />

        <SportSettingsButtons sports={sports} />

        <TournamentContactFields value={details} onChange={patchDetails} />

        <FieldLabel>Player reminders</FieldLabel>
        <View style={st.chips}>
          <SelectChip label="Each player's own settings" active={!customReminders} onPress={() => setCustomReminders(false)} />
          <SelectChip label="Custom for this tournament" active={customReminders} onPress={() => setCustomReminders(true)} />
        </View>
        {customReminders && (
          <View style={st.chips}>
            {LEAD_OPTIONS.map((o) => (
              <SelectChip
                key={o.key}
                label={o.label}
                active={reminderMins.includes(o.minutes)}
                onPress={() => setReminderMins((prev) => (prev.includes(o.minutes) ? prev.filter((x) => x !== o.minutes) : [...prev, o.minutes]))}
              />
            ))}
          </View>
        )}
        <Text style={st.hint}>
          {customReminders
            ? 'Everyone playing in this tournament is reminded before kickoff on these times.'
            : 'Each player is reminded using their own settings from Profile.'}
        </Text>

        <FieldLabel>Registration</FieldLabel>
        <View style={st.chips}>
          <SelectChip label="🔓 Open — teams can find & request to join" active={isOpen} onPress={() => setIsOpen(true)} />
          <SelectChip label="🔒 Invite only" active={!isOpen} onPress={() => setIsOpen(false)} />
        </View>
        <Text style={st.hint}>Open tournaments appear in Discover for teams to register.</Text>

        {isOpen && (
          <View style={{ gap: theme.spacing(3) }}>
            {regDeadline ? (
              <View style={{ gap: theme.spacing(2) }}>
                <DateTimeField label="Registration deadline" value={regDeadline} onChange={setRegDeadline} />
                <Text style={st.linkText} onPress={() => setRegDeadline(null)}>Remove deadline</Text>
              </View>
            ) : (
              <SelectChip label="＋ Add a registration deadline" active={false} onPress={() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); setRegDeadline(d); }} />
            )}
            <View style={st.capRow}>
              <View style={st.capCell}>
                <FieldLabel>Min teams</FieldLabel>
                <NumStepper value={minTeams} min={0} max={128} onChange={setMinTeams} zeroLabel="—" />
              </View>
              <View style={st.capCell}>
                <FieldLabel>Max teams (cap)</FieldLabel>
                <NumStepper value={maxTeams} min={0} max={128} onChange={setMaxTeams} zeroLabel="∞" />
              </View>
            </View>
            <Text style={textStyles.muted}>Below the minimum is just a heads-up; the maximum caps public sign-ups (you can still add teams yourself).</Text>
          </View>
        )}

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create tournament'} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Small +/− stepper for team caps (0 shows a placeholder like — or ∞). */
function NumStepper({ value, min, max, onChange, zeroLabel }: { value: number; min: number; max: number; onChange: (v: number) => void; zeroLabel?: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={st.stepper}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fewer" style={st.stepBtn} onPress={() => onChange(clamp(value - 1))}><Text style={st.stepTxt}>−</Text></TouchableOpacity>
      <Text style={st.stepVal}>{value === 0 && zeroLabel ? zeroLabel : value}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="More" style={st.stepBtn} onPress={() => onChange(clamp(value + 1))}><Text style={st.stepTxt}>+</Text></TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  fmtCard: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  linkText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  capRow: { flexDirection: 'row', gap: theme.spacing(3) },
  capCell: { flex: 1, gap: theme.spacing(1) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  stepTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  stepVal: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.h3, minWidth: 30, textAlign: 'center' },
});
