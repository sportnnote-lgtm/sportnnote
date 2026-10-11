/** SD-154 — Import a roster (CSV): a school's students (with class and House)
 *  or a team's squad, pasted from a spreadsheet or picked as a .csv file (web).
 *  Shows a preview first: every row with what will happen, duplicates of people
 *  already there (skipped unless kept), rows that can't be read, and — for a
 *  file whose dates fit both orders — a day-first / month-first switch.
 *  Guardian contacts go on the child's guardian record (private), never on the
 *  child's own profile. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, ScreenTitle, SelectChip, TextField, FormError, LoadingState, textStyles } from '../components/ui';
import { getOrganization, getPlayers, getTeams, createPlayer, updatePlayer, setOrgMembers, setTeamRoster } from '../data/repos';
import { parseRoster, importable, ageOn, ROSTER_TEMPLATE, type RosterRow, type ExistingPerson } from '../data/rosterImport';
import { useRegion, spelledDate, dateOrderWords, type DateOrder } from '../core/region';
import { defaultPhoneCountry } from '../core/phone';
import { pickTextFile } from '../core/document';
import { downloadText } from '../core/download';
import { todayIn } from '../core/time';
import { notice } from '../core/confirm';
import { teamLabel } from '../core/teamLevels';
import type { RootStackParamList } from '../navigation/types';
import type { Organization, Player, Team } from '../core/types';

export default function RosterImportScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'RosterImport'>>();
  const region = useRegion();
  const [org, setOrg] = useState<Organization | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [forceOrder, setForceOrder] = useState<DateOrder | undefined>(undefined);
  const [keepDup, setKeepDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      const [o, ps, ts] = await Promise.all([
        params?.orgId ? getOrganization(params.orgId) : Promise.resolve(null), getPlayers(), params?.teamId ? getTeams() : Promise.resolve([] as Team[]),
      ]);
      if (!on) return;
      setOrg(o); setPlayers(ps); setTeam(ts.find((t) => t.id === params?.teamId) ?? null); setLoading(false);
    })().catch((e) => { if (on) { setError(e instanceof Error ? e.message : 'Couldn’t load'); setLoading(false); } });
    return () => { on = false; };
  }, [params?.orgId, params?.teamId]);

  // The people already there: the school's members, or the team's squad.
  const existing: ExistingPerson[] = useMemo(() => {
    const ids = new Set<string>([...(org?.members ?? []).filter((m) => !m.until).map((m) => m.playerId), ...(team?.roster ?? [])]);
    return players.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, fullName: p.fullName, dob: p.dob, guardianEmail: p.guardian?.email }));
  }, [org, team, players]);
  const inTeam = new Set(team?.roster ?? []);

  const parsed = useMemo(() => (text.trim() ? parseRoster(text, { order: region.dateOrder, country: defaultPhoneCountry(), existing, forceOrder }) : null), [text, region.dateOrder, existing, forceOrder]);
  const rows = parsed?.rows ?? [];
  const todo = importable(rows, keepDup);
  // a team import: people already in the school but not in this squad are just added to it
  const linkOnly = team ? rows.filter((r) => !r.errors.length && r.dupInFile == null && r.duplicateOf && !inTeam.has(r.duplicateOf.id)) : [];
  const newRows = todo.filter((r) => !r.duplicateOf || (keepDup && !linkOnly.includes(r)));

  async function chooseFile() {
    setError(null);
    const f = await pickTextFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values,.xlsx,.xls');
    if (!f) return;
    if (/\.(xlsx?|xlsm|ods|numbers)$/i.test(f.name) || !f.text) { setError('Save it as CSV first (File → Save as → CSV), or copy the cells and paste them here.'); return; }
    setFileNote(`Loaded ${f.name}`); setForceOrder(undefined); setText(f.text); setDone(null);
  }

  async function run() {
    if (busy || (!newRows.length && !linkOnly.length)) return;
    setBusy(true); setError(null);
    const today = todayIn();
    const created: { id: string; row: RosterRow }[] = [];
    const failed: string[] = [];
    try {
      for (const r of newRows) {
        try {
          const p = await createPlayer({ fullName: r.fullName, houseName: r.house, jerseyNo: r.jersey, sports: team ? [team.sport] : [] });
          // Private details: DOB, gender and the GUARDIAN's contact (never the child's own phone/email)
          const patch: Parameters<typeof updatePlayer>[1] = {};
          if (r.dob) patch.dob = r.dob;
          if (r.gender) patch.gender = r.gender;
          if (r.guardian) patch.guardian = r.guardian;
          if (Object.keys(patch).length) await updatePlayer(p.id, patch).catch(() => { failed.push(`${r.fullName} (details)`); });
          created.push({ id: p.id, row: r });
        } catch { failed.push(r.fullName); }
      }
      if (org) {
        const add = created.map(({ id, row }) => ({
          playerId: id, role: 'Member' as const, since: today,
          ...(row.standard ? { grades: [{ standard: row.standard, since: today }] } : {}),
          ...(row.house ? { houses: [{ house: row.house, since: today }] } : {}),
        }));
        if (add.length) await setOrgMembers(org.id, [...org.members, ...add]);
      }
      if (team) {
        const ids = [...created.map((c) => c.id), ...linkOnly.map((r) => r.duplicateOf!.id)];
        if (ids.length) await setTeamRoster(team.id, [...new Set([...(team.roster ?? []), ...ids])]);
      }
      const msg = `${created.length} added${linkOnly.length && team ? `, ${linkOnly.length} already at the school added to the squad` : ''}${failed.length ? ` · couldn’t add: ${failed.join(', ')}` : ''}.`;
      setDone(msg); setText(''); setFileNote(null);
      notice('Roster imported', msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import stopped part-way — check the list and try again.');
    } finally { setBusy(false); }
  }

  if (loading) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;
  const where = team ? teamLabel(team) : org?.name ?? 'the roster';
  const otherOrder: DateOrder = parsed?.dateOrder === 'MDY' ? 'DMY' : 'MDY';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="📥 Import a roster" subtitle={where} />
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.muted}>From your school system or a spreadsheet saved as CSV. Columns, any order: Name (or First name + Last name), Date of birth, Gender, Class / Year, House, Team, Jersey, Guardian name, Guardian email, Guardian phone. Dates are {dateOrderWords(region.dateOrder)}.</Text>
          <View style={st.chips}>
            {Platform.OS === 'web' ? <Button label="📂 Choose CSV file" variant="ghost" onPress={() => void chooseFile()} /> : null}
            <Button label="⬇ Template" variant="ghost" onPress={() => { downloadText('roster-template.csv', 'text/csv', ROSTER_TEMPLATE(region.dateOrder)); }} />
          </View>
          {fileNote ? <Text style={textStyles.muted}>{fileNote}</Text> : null}
          <TextField label={Platform.OS === 'web' ? '…or paste the rows (with the header row)' : 'Paste the rows (with the header row)'} value={text} onChange={(v) => { setText(v); setFileNote(null); setDone(null); }} multiline
            placeholder={ROSTER_TEMPLATE(region.dateOrder).trim()} autoCapitalize="none" />
          <Text style={textStyles.muted}>🔒 Guardian contacts stay private: only the guardian, {org ? 'the school’s admins' : 'the team’s managers'} and coaches see them. Children never get their own contact details from an import.</Text>
        </Card>

        {parsed?.missingName ? <Text style={st.warn}>⚠ No Name column found — add a header row with “Name” (or “First name” and “Last name”).</Text> : null}
        {parsed?.ambiguousDates ? (
          <Card style={{ gap: theme.spacing(1) }}>
            <Text style={st.warn}>⚠ Every date fits both ways — is 04/05/2012 the 4th of May or April 5th?</Text>
            <View style={st.chips}>
              <SelectChip label="Day first (4 May)" active={(forceOrder ?? parsed.dateOrder) === 'DMY'} onPress={() => setForceOrder('DMY')} />
              <SelectChip label="Month first (April 5)" active={(forceOrder ?? parsed.dateOrder) === 'MDY'} onPress={() => setForceOrder('MDY')} />
            </View>
          </Card>
        ) : parsed?.orderFromFile ? <Text style={textStyles.muted}>Dates read {dateOrderWords(parsed.orderFromFile)} (the file says so). <Text style={st.link} onPress={() => setForceOrder(otherOrder)}>Read them {dateOrderWords(otherOrder)}</Text></Text> : null}

        {rows.length ? (
          <Card style={{ gap: theme.spacing(1.5) }}>
            <Text style={textStyles.h3}>Preview · {rows.length} row{rows.length === 1 ? '' : 's'}</Text>
            <Text style={textStyles.muted}>{newRows.length} new · {rows.filter((r) => r.duplicateOf || r.dupInFile != null).length} already there · {rows.filter((r) => r.errors.length).length} can’t be read</Text>
            {rows.map((r) => {
              const status = r.errors.length ? `✗ ${r.errors.join('; ')}`
                : r.dupInFile != null ? `↺ Same as line ${r.dupInFile}`
                : r.duplicateOf ? (team && !inTeam.has(r.duplicateOf.id) ? `＋ Already at the school (${r.duplicateOf.why}) — added to the squad` : keepDup ? `＋ Added again (${r.duplicateOf.why})` : `↺ Already here (${r.duplicateOf.why}) — skipped`)
                : '＋ New';
              const minor = r.dob ? ageOn(r.dob) < 18 : false;
              return (
                <View key={r.line} style={st.row}>
                  <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{r.line}. {r.fullName || '—'}</Text>
                  <Text style={textStyles.muted} numberOfLines={2}>
                    {[r.dob ? `${spelledDate(r.dob)}${minor ? ' · under 18' : ''}` : '', r.gender, r.standard, r.house ? `${r.house} House` : '', r.team, r.jersey != null ? `#${r.jersey}` : '', r.guardian ? `guardian: ${r.guardian.name}${r.guardian.email ? ' ✉' : ''}${r.guardian.phone ? ' ☎' : ''}` : ''].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[textStyles.muted, r.errors.length ? st.warn : null]}>{status}</Text>
                  {r.warnings.length ? <Text style={textStyles.muted}>⚠ {r.warnings.join('; ')}</Text> : null}
                </View>
              );
            })}
            {rows.some((r) => r.duplicateOf) ? <SelectChip label={keepDup ? '✓ Add look-alikes as new people' : 'Add look-alikes as new people'} active={keepDup} onPress={() => setKeepDup(!keepDup)} /> : null}
          </Card>
        ) : null}

        <FormError message={error} />
        {done ? <Text style={textStyles.muted}>✅ {done}</Text> : null}
        <Button label={busy ? 'Importing…' : `Import ${newRows.length + linkOnly.length} ${newRows.length + linkOnly.length === 1 ? 'person' : 'people'} into ${where}`} disabled={busy || !(newRows.length + linkOnly.length)} onPress={() => void run()} />
        {done ? <Button label="Done" variant="ghost" onPress={() => nav.goBack()} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5) },
  row: { gap: 2, paddingVertical: theme.spacing(1), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  bold: { fontWeight: '700' },
  warn: { color: theme.colors.accent, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontWeight: '700' },
});
