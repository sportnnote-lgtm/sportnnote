/**
 * SD-130 — a meet's record board. A school's records usually go back decades
 * on a painted board; without them the first final of every event "sets a
 * meet record". Organisers add them here — one at a time, or pasted from a
 * spreadsheet / notes (event, category, mark, holder, house, year) — as
 * meet records (this meet's board) or school records (every meet the school
 * hosts). A final then flags MR / SR only when it beats them. Records are
 * written with merge_field_records (one at a time on the server, so a final
 * locked meanwhile keeps its record).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, FormError, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { useAuth } from '../core/auth';
import { canOrganize } from '../core/roles';
import { canManageTournament } from '../core/org';
import { useOrganizations, useTournamentById } from '../data/hooks';
import { getMyPlayerId } from '../data/repos';
import { addHistoricRecords, getRecordBook, removeRecord } from '../data/resultsStore';
import {
  AGE_GROUPS, COURSES, categoryLabel, disciplineOf, formatMark, historicRecord, parseRecordBoard, recordDisciplines, recordLine,
  type Category, type Course, type RecordMark, type RecordScope,
} from '../data/results';
import type { RootStackParamList } from '../navigation/types';

const GENDERS: { key: 'M' | 'F' | 'X'; label: string }[] = [{ key: 'M', label: 'Boys' }, { key: 'F', label: 'Girls' }, { key: 'X', label: 'Mixed' }];

export default function RecordBoardScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'RecordBoard'>>();
  const sport = params.sport ?? 'athletics';
  const swim = sport === 'swimming';
  const tournament = useTournamentById(params.tournamentId);
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { void getMyPlayerId(profile?.id).then(setMe).catch(() => {}); }, [profile?.id]);
  const canEdit = canOrganize(profile?.role) || (!!tournament && canManageTournament(tournament, orgs, me));
  const school = !!tournament?.hostOrgId;

  const [book, setBook] = useState<RecordMark[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => { setBook(await getRecordBook(params.tournamentId, sport)); setLoading(false); };
  useEffect(() => { void reload(); }, [params.tournamentId, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const [scope, setScope] = useState<RecordScope>('MR');
  const [mode, setMode] = useState<'one' | 'paste'>('one');
  const [age, setAge] = useState<string>('U14');
  const [gender, setGender] = useState<'M' | 'F' | 'X'>('M');
  const [course, setCourse] = useState<Course>('LCM');
  const [discipline, setDiscipline] = useState<string>('');
  const [mark, setMark] = useState('');
  const [holder, setHolder] = useState('');
  const [team, setTeam] = useState('');
  const [year, setYear] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const events = useMemo(() => recordDisciplines(sport), [sport]);
  const def = discipline ? disciplineOf(discipline) : undefined;
  const cat: Category = { age, gender, ...(swim ? { course } : {}) };
  const parsed = useMemo(() => (paste.trim() ? parseRecordBoard(paste, sport, scope, swim ? course : undefined) : []), [paste, sport, scope, swim, course]);
  const good = parsed.filter((p) => p.rec);
  const bad = parsed.filter((p) => p.error);

  const saveOne = async () => {
    setError(null); setInfo(null);
    const r = historicRecord({ scope, discipline, category: cat, mark, holder, team, year: year.trim() ? Number(year) : undefined });
    if (r.error || !r.rec) { setError(r.error ?? 'Check the record.'); return; }
    const cur = book.find((b) => b.scope === scope && b.discipline === r.rec!.discipline && b.category === r.rec!.category);
    if (cur && !(await askConfirm({ title: 'Replace the record?', message: `${recordLine(cur, formatMark)} is on the board. Replace it with ${formatMark(r.rec.value, def!)} by ${r.rec.holder}?`, yesLabel: 'Yes, replace', noLabel: 'No, keep it', tone: 'caution' }))) return;
    setBusy(true);
    try {
      setBook(await addHistoricRecords(params.tournamentId, sport, [r.rec]));
      setInfo(`Saved: ${recordLine(r.rec, formatMark)}`);
      setMark(''); setHolder(''); setTeam(''); setYear('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const savePaste = async () => {
    setError(null); setInfo(null);
    if (!good.length) { setError('Nothing to add — check the lines below.'); return; }
    const replacing = good.filter((p) => book.some((b) => b.scope === scope && b.discipline === p.rec!.discipline && b.category === p.rec!.category)).length;
    const ok = await askConfirm({ title: `Add ${good.length} record${good.length === 1 ? '' : 's'}?`, message: `${replacing ? `${replacing} replace a record already on the board. ` : ''}${bad.length ? `${bad.length} line${bad.length === 1 ? '' : 's'} with a problem will be skipped. ` : ''}A final only sets a ${scope === 'MR' ? 'meet' : 'school'} record when it beats these.`, yesLabel: 'Yes, add them', noLabel: 'No, go back', tone: 'caution' });
    if (!ok) return;
    setBusy(true);
    try {
      setBook(await addHistoricRecords(params.tournamentId, sport, good.map((p) => p.rec!)));
      setInfo(`Added ${good.length} record${good.length === 1 ? '' : 's'}.`);
      setPaste('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (r: RecordMark) => {
    const ok = await askConfirm({ title: 'Remove this record?', message: `${recordLine(r, formatMark)} comes off the ${r.scope === 'MR' ? 'meet' : 'school'} board. The next final in this event and category sets the record afresh.`, yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' });
    if (!ok) return;
    try { setBook(await removeRecord(params.tournamentId, sport, r)); } catch (e) { setError((e as Error).message); }
  };

  const shown = book.filter((r) => disciplineOf(r.discipline)?.sport === sport)
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.category.localeCompare(b.category) || a.discipline.localeCompare(b.discipline));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="📖 Record board" subtitle={tournament?.name} />
        <Text style={textStyles.muted}>Enter the records your school already has, so the first final of each event doesn’t automatically set a record. A final flags MR{school ? ' / SR' : ''} only when it beats the board.</Text>

        {canEdit && (
          <Card style={st.card}>
            <View style={st.wrap}>
              <SelectChip label="Meet records (this meet)" active={scope === 'MR'} onPress={() => setScope('MR')} />
              {school && <SelectChip label="School records (every meet)" active={scope === 'SR'} onPress={() => setScope('SR')} />}
            </View>
            <View style={st.wrap}>
              <SelectChip label="One record" active={mode === 'one'} onPress={() => setMode('one')} />
              <SelectChip label="Paste a list" active={mode === 'paste'} onPress={() => setMode('paste')} />
            </View>
            {swim && <View style={st.wrap}>{COURSES.map((c) => <SelectChip key={c.key} label={c.label} active={course === c.key} onPress={() => setCourse(c.key)} />)}</View>}

            {mode === 'one' ? (
              <>
                <Text style={st.label}>Category</Text>
                <View style={st.wrap}>{AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}</View>
                <View style={st.wrap}>{GENDERS.map((g) => <SelectChip key={g.key} label={g.label} active={gender === g.key} onPress={() => setGender(g.key)} />)}</View>
                <Text style={st.label}>Event</Text>
                <View style={st.wrap}>{events.map((d) => <SelectChip key={d.key} label={d.label} active={discipline === d.key} onPress={() => setDiscipline(d.key)} />)}</View>
                <TextField label={def?.unit === 'time' ? 'Time (e.g. 12.84 or 2:05.3)' : def?.unit === 'mass' ? 'Kilograms' : def?.unit === 'points' ? 'Points' : 'Mark in metres (e.g. 5.62)'} value={mark} onChange={setMark} placeholder={def?.unit === 'time' ? '12.84' : '5.62'} autoCapitalize="none" />
                <TextField label="Record holder" value={holder} onChange={setHolder} placeholder="Asha Rao" autoCapitalize="words" />
                <TextField label="House / school (optional)" value={team} onChange={setTeam} placeholder="Red House" autoCapitalize="words" />
                <TextField label="Year (optional)" value={year} onChange={setYear} placeholder="2009" autoCapitalize="none" />
                <FormError message={error} />
                {info ? <Text style={st.ok}>✓ {info}</Text> : null}
                <Button label={busy ? 'Saving…' : `Save ${categoryLabel(cat)} record`} onPress={() => void saveOne()} disabled={busy || !discipline} />
              </>
            ) : (
              <>
                <Text style={textStyles.muted}>One record per line: event, category, mark, holder, house, year. Copy the columns straight from a spreadsheet, or type them with commas.</Text>
                <TextField label="Records" value={paste} onChange={setPaste} multiline autoCapitalize="none"
                  placeholder={swim ? '50 m freestyle, U14 Girls, 31.20, Meera Iyer, Blue House, 2015' : '100 m, U14 Boys, 12.84, Asha Rao, Red House, 2009\nLong jump, U17 Girls, 4.92, Meera Iyer, Blue House, 1998'} />
                {parsed.length > 0 && (
                  <View style={{ gap: theme.spacing(1) }}>
                    {parsed.map((p) => (
                      <Text key={p.line} style={p.error ? st.bad : textStyles.muted} numberOfLines={2}>
                        {p.rec ? `✓ ${recordLine(p.rec, formatMark)}` : `Line ${p.line}: ${p.error}`}
                      </Text>
                    ))}
                  </View>
                )}
                <FormError message={error} />
                {info ? <Text style={st.ok}>✓ {info}</Text> : null}
                <Button label={busy ? 'Saving…' : `Add ${good.length || ''} record${good.length === 1 ? '' : 's'}`.replace('  ', ' ')} onPress={() => void savePaste()} disabled={busy || !good.length} />
              </>
            )}
          </Card>
        )}

        <Text style={textStyles.h3}>On the board</Text>
        {loading ? <Text style={textStyles.muted}>Loading…</Text> : shown.length === 0 ? (
          <Text style={textStyles.muted}>No records yet.{canEdit ? ' Add the ones from your school’s board above.' : ''}</Text>
        ) : (
          <Card style={{ gap: theme.spacing(2) }}>
            {shown.map((r) => (
              <View key={`${r.scope}|${r.discipline}|${r.category}`} style={st.row}>
                <Text style={st.scope}>{r.scope}</Text>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={2}>{recordLine(r, formatMark)}{r.historic ? '' : ' · set at this meet'}</Text>
                {canEdit && (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${recordLine(r, formatMark)}`} onPress={() => void remove(r)} hitSlop={8}>
                    <Text style={st.remove}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  card: { gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  ok: { color: theme.colors.primary, fontWeight: '700' },
  bad: { color: theme.colors.danger, fontSize: theme.font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  scope: { color: theme.colors.accent, fontWeight: '800', width: 28 },
  remove: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.body, paddingHorizontal: theme.spacing(1) },
});
