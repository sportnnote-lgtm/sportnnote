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
import { DateField } from '../components/DateTimeField';
import { MedalScoringEditor } from '../components/MedalScoringEditor';
import { SportSettingsButtons, coarseStructureFrom } from '../components/SportSettingsButtons';
import { tournamentDraft } from '../data/tournamentDraft';
import { CoHostPicker, type CoHost } from '../components/CoHostPicker';
import { DivisionsEditor } from '../components/DivisionsEditor';
import type { NewTournamentCategory } from '../core/types';
import { LEAD_OPTIONS, DEFAULT_LEAD_MINUTES } from '../data/reminderPrefs';
import { SPORT_LIST, getSport } from '../sports/registry';
import { createTournament, getMyPlayerId, getPlayer } from '../data/repos';
import { useAuth } from '../core/auth';
import { useOrganizations } from '../data/hooks';
import { organizableOrgsForPlayer } from '../core/org';
import type { SportId, TournamentStructure, TournamentScoring } from '../core/types';
import type { FormatField } from '../sports/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FormatVal = number | string | boolean;
type FormatMap = Partial<Record<SportId, Record<string, FormatVal>>>;

const defaultsFor = (fields: FormatField[]) =>
  Object.fromEntries(fields.map((f) => [f.key, f.default]));

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
  const [myName, setMyName] = useState('You');
  const [hostChoice, setHostChoice] = useState<'self' | string>(params?.orgId ?? 'self');
  const [coHosts, setCoHosts] = useState<CoHost[]>([]);
  const [divisions, setDivisions] = useState<NewTournamentCategory[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  React.useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then(async (id) => {
      if (!on || !id) return;
      setMyId(id);
      const p = await getPlayer(id);
      if (on && p) setMyName(p.fullName);
    });
    return () => { on = false; };
  }, [profile?.id]);
  // Only communities where you're an Admin or Organizer can host your event.
  const myOrgs = organizableOrgsForPlayer(orgs, myId);
  const [start, setStart] = useState(() => toISODate(new Date()));
  const [end, setEnd] = useState(() => toISODate(addDays(new Date(), 5)));
  const [sports, setSports] = useState<SportId[]>(initialSport ? [initialSport] : []);
  const [scoring, setScoring] = useState<TournamentScoring | undefined>(undefined);
  const [formats, setFormats] = useState<FormatMap>(
    initialSport ? { [initialSport]: defaultsFor(getSport(initialSport).formatFields ?? []) } : {}
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
      const seeded = fields.length ? defaultsFor(fields) : {};
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
      await createTournament({
        name: name.trim(),
        hostName: chosenOrg ? chosenOrg.name : myName,
        hostOrgId: chosenOrg?.id,
        isOpen,
        sports,
        startDate: s, endDate: e,
        formats: finalFormats,
        structure: coarseStructureFrom(finalFormats, sports),
        scoring: sports.length > 1 ? scoring : undefined,
        reminderLeadMinutes: customReminders ? reminderMins : undefined,
        coHostIds: coHosts.map((c) => c.id),
        categories: divisions.length ? divisions : undefined,
      });
      nav.goBack();
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
        <TextField label="Name" value={name} onChange={setName} placeholder="Annual Sports Meet 2026" />

        <FieldLabel>Host</FieldLabel>
        <View style={st.chips}>
          <SelectChip label={`🙋 Myself (${myName})`} active={hostChoice === 'self'} onPress={() => setHostChoice('self')} />
          {myOrgs.map((o) => (
            <SelectChip key={o.id} label={`🏛️ ${o.name}`} active={hostChoice === o.id} onPress={() => setHostChoice(o.id)} />
          ))}
        </View>
        <Text style={st.hint}>
          {hostChoice === 'self'
            ? 'You host this tournament personally.'
            : 'Everyone in this organization can manage it and gets host reminders.'}
        </Text>

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

        <SportSettingsButtons sports={sports} />

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

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create tournament'} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
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
});
