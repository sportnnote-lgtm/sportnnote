/** Import a tournament's schedule from a spreadsheet (parity #24). Three steps on
 *  one screen: get the template → paste rows (or pick a CSV on web) → check the
 *  preview, fix near-miss team names with one tap, then create every match.
 *  All the parsing/validation lives in data/scheduleImport.ts; this screen only
 *  renders it and runs the sequential create (safe to retry after a failure). */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, Pill, ScreenTitle, SelectChip, TextField, FormError, LoadingState, textStyles } from '../components/ui';
import { defaultsFor } from '../components/FormatEditor';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useMatches, useTeams, useTournamentById, useTournamentTeams } from '../data/hooks';
import { addTournamentTeams, createMatch, getMyPlayerId } from '../data/repos';
import { importFromText, importSummary, templateCsv, slugify, type ImportField, type ImportRow } from '../data/scheduleImport';
import { matchFormatFor } from '../data/matchFormat';
import { isEliminationStage, isKoStage, KO_STAGE_LABEL } from '../data/bracket';
import { formatDateTime, useUserTimeZone } from '../core/time';
import { pickTextFile } from '../core/document';
import { downloadText } from '../core/download';
import { notice } from '../core/confirm';
import { useAuth } from '../core/auth';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Overrides = Record<number, Partial<Record<ImportField, string>>>;

/** One row's identity for "already created" — the line plus what it resolved
 *  to, so editing a created row's cells makes it a new match, not a skip. */
const rowKey = (r: ImportRow) => (r.draft ? `${r.line}|${r.draft.home.id}|${r.draft.away.id}|${r.draft.startsAt}` : `${r.line}`);

function stageLabel(stage?: string, group?: string): string | undefined {
  if (stage === 'group') return group ? `Group ${group}` : 'League';
  if (isKoStage(stage)) return KO_STAGE_LABEL[stage];
  if (stage === 'super') return 'Super round';
  if (stage === 'third') return 'Third place';
  return stage ?? (group ? `Group ${group}` : undefined);
}

export default function ImportScheduleScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ImportSchedule'>>();
  const tid = params.tournamentId;
  const { profile } = useAuth();
  const zone = useUserTimeZone();
  const tournament = useTournamentById(tid);
  const entered = useTournamentTeams(tid);
  const allTeams = useTeams();
  const { matches } = useMatches('all');
  const tourMatches = useMemo(() => matches.filter((m) => m.tournamentId === tid), [matches, tid]);

  const [text, setText] = useState('');
  const [parsedText, setParsedText] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [created, setCreated] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parse 300 ms after the last keystroke — a big paste shouldn't re-validate per character.
  useEffect(() => {
    const h = setTimeout(() => setParsedText(text), 300);
    return () => clearTimeout(h);
  }, [text]);

  const sportsList = useMemo(() => SPORT_LIST.map((s) => ({ id: s.id, name: s.name })), []);
  const result = useMemo(() => {
    if (!tournament || !parsedText.trim()) return null;
    return importFromText(parsedText, {
      tournament, sports: sportsList, entered, allTeams, existing: matches, zone, skipLines: skip,
    }, overrides);
  }, [tournament, parsedText, sportsList, entered, allTeams, matches, zone, skip, overrides]);
  const rows = result?.rows ?? [];
  const summary = importSummary(rows, skip);
  const isCreated = (r: ImportRow) => created.has(rowKey(r));
  const todo = rows.filter((r) => r.draft && r.status !== 'error' && !skip.has(r.line) && !isCreated(r));
  const createdCount = rows.filter(isCreated).length;
  const shown = onlyProblems ? rows.filter((r) => r.status !== 'ok' && !isCreated(r)) : rows;

  if (!tournament) return <LoadingState />;

  const tourSportTeams = entered.filter((t) => tournament.sports.includes(t.sport));
  const multiSport = tournament.sports.length > 1;

  async function downloadTemplate() {
    if (!tournament) return;
    const csv = templateCsv(tournament, entered, { matches: tourMatches, sportName: (id) => getSport(id).name });
    const name = `${slugify(tournament.name)}-schedule.csv`;
    if (downloadText(name, 'text/csv;charset=utf-8', csv)) return;
    await Share.share({ title: name, message: csv });
  }

  async function chooseFile() {
    setFileError(null);
    const f = await pickTextFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values,.xlsx,.xls');
    if (!f) return;
    if (/\.(xlsx?|xlsm|ods|numbers)$/i.test(f.name) || !f.text) {
      setFileError('Save as CSV, or copy the cells and paste them here.');
      return;
    }
    setFileNote(`Loaded ${f.name}`);
    setOverrides({}); setSkip(new Set());
    setText(f.text); setParsedText(f.text);
  }

  const fixCell = (line: number, field: ImportField, value: string) =>
    setOverrides((o) => ({ ...o, [line]: { ...o[line], [field]: value } }));
  const toggleSkip = (line: number) =>
    setSkip((s) => { const n = new Set(s); if (n.has(line)) n.delete(line); else n.add(line); return n; });

  async function create() {
    if (!todo.length || busy) return;
    setError(null); setBusy(true);
    const total = todo.length + createdCount;
    let done = createdCount;
    const madeNow = new Set(created);
    setProgress({ done, total });
    try {
      const myId = await getMyPlayerId(profile?.id);
      // Teams found by name but not entered yet join the tournament first (once).
      const addIds = [...new Set(todo.flatMap((r) => r.draft!.addTeamIds))];
      if (addIds.length) await addTournamentTeams(tid, addIds, 'confirmed');
      for (const r of todo) {
        const d = r.draft!;
        try {
          await createMatch({
            tournamentId: tid, sport: d.sport,
            group: d.group, stage: d.stage,
            homeTeamId: d.home.id, awayTeamId: d.away.id,
            startsAt: d.startsAt,
            venueName: d.venueName,
            hostIds: myId ? [myId] : [],
            format: matchFormatFor(tournament, d.sport, isEliminationStage(d.stage), defaultsFor(getSport(d.sport).formatFields ?? [])),
          });
        } catch (e) {
          setError(`Created ${done} of ${total}. Row #${r.line} failed: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        madeNow.add(rowKey(r));
        setCreated(new Set(madeNow)); // a retry skips rows already made
        done++;
        setProgress({ done, total });
      }
      notice('Schedule imported', `${done} match${done === 1 ? '' : 'es'} added to ${tournament?.name}. Assign scorers from Manage → Scorers & officials.`);
      nav.goBack();
    } catch (e) {
      setError(`Created ${done} of ${total}. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const n = todo.length;
  const label = busy && progress ? `Creating ${progress.done} / ${progress.total}…` : `Create ${n} match${n === 1 ? '' : 'es'}`;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Import schedule" subtitle={tournament.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Get the template</Text>
          <Text style={textStyles.muted}>
            One row per match. Dates like 12/10/2026 (day first), times like 4:30 pm. Team names must match your teams.
            {multiSport ? ' Add the sport on every row.' : ''}
          </Text>
          <Button label="⬇ Download template (CSV)" variant="ghost" onPress={() => void downloadTemplate()} />
          {tourSportTeams.length ? (
            <View style={st.chips}>
              {tourSportTeams.map((t) => <Pill key={t.id} label={multiSport ? `${getSport(t.sport).icon} ${t.name}` : t.name} />)}
            </View>
          ) : (
            <TouchableOpacity onPress={() => nav.navigate('TournamentTeams', { tournamentId: tid })} accessibilityRole="link">
              <Text style={st.link}>No teams in this tournament yet — add them first →</Text>
            </TouchableOpacity>
          )}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Add your matches</Text>
          {Platform.OS === 'web' && <Button label="📂 Choose CSV file" variant="ghost" onPress={() => void chooseFile()} />}
          <FormError message={fileError} />
          {fileNote ? <Text style={textStyles.muted}>{fileNote}</Text> : null}
          <TextField
            label={Platform.OS === 'web' ? '…or paste rows from Excel / Google Sheets' : 'Paste rows from Excel / Google Sheets'}
            value={text}
            onChange={(v) => { setText(v); setFileNote(null); setFileError(null); }}
            placeholder={'date\ttime\thome_team\taway_team\tvenue\n12/10/2026\t4:30 pm\tRed House\tBlue House\tMain Ground'}
            autoCapitalize="none"
            multiline
          />
          {result && !result.hasHeader && rows.length > 0 && (
            <Text style={textStyles.muted}>No header row — reading columns as date, time, home team, away team, venue, group, stage, sport.</Text>
          )}
          {result && result.unknownColumns.length > 0 && (
            <Text style={textStyles.muted}>Ignored columns: {result.unknownColumns.join(', ')}</Text>
          )}
        </Card>

        {rows.length > 0 && (
          <View style={st.preview}>
            <Text style={textStyles.h3}>3 · Check and create</Text>
            <View style={st.chips}>
              <Pill label={`✓ ${summary.ok} ready`} color={theme.colors.primary + '22'} textColor={theme.colors.primary} />
              <Pill label={`⚠ ${summary.warn} to check`} color={theme.colors.accent + '22'} textColor={theme.colors.accent} />
              <Pill label={`✕ ${summary.error} won't import`} color={theme.colors.danger + '22'} textColor={theme.colors.danger} />
              {skip.size > 0 && <Pill label={`${skip.size} skipped`} />}
            </View>
            {summary.guessed > 0 && (
              <Text style={[textStyles.muted, { color: theme.colors.accent }]}>
                ⚠ {summary.guessed} row{summary.guessed === 1 ? '' : 's'} will import with the suggested team name (“Did you mean…?”). Tap “Use …” to confirm, or skip the row.
              </Text>
            )}
            <View style={st.chips}>
              <SelectChip label="All" active={!onlyProblems} onPress={() => setOnlyProblems(false)} />
              <SelectChip label={`Problems (${summary.warn + summary.error})`} active={onlyProblems} onPress={() => setOnlyProblems(true)} />
            </View>
            {shown.map((r) => (
              <RowCard
                key={r.line}
                row={r}
                zone={zone}
                skipped={skip.has(r.line)}
                created={isCreated(r)}
                onSkip={() => toggleSkip(r.line)}
                onFix={fixCell}
                onAddTeams={() => nav.navigate('TournamentTeams', { tournamentId: tid })}
              />
            ))}
            {onlyProblems && shown.length === 0 && <Text style={textStyles.muted}>No problems — every row is ready.</Text>}
          </View>
        )}
      </ScrollView>

      {rows.length > 0 && (
        <View style={st.footer}>
          <FormError message={error} />
          <Button label={label} onPress={() => void create()} disabled={busy || n === 0} />
        </View>
      )}
    </SafeAreaView>
  );
}

function RowCard({ row: r, zone, skipped, created, onSkip, onFix, onAddTeams }: {
  row: ImportRow; zone: string; skipped: boolean; created: boolean;
  onSkip: () => void; onFix: (line: number, field: ImportField, value: string) => void; onAddTeams: () => void;
}) {
  const d = r.draft;
  const when = d ? formatDateTime(d.startsAt, zone) : [r.cells.date || 'no date', r.cells.time].filter(Boolean).join(' · ');
  const home = d?.home.name ?? r.cells.home_team ?? '—';
  const away = d?.away.name ?? r.cells.away_team ?? '—';
  const meta = [d?.venueName ?? r.cells.venue, stageLabel(d?.stage, d?.group ?? r.cells.group) ?? r.cells.stage].filter(Boolean).join(' · ');
  const edge = created ? theme.colors.primary : r.status === 'error' ? theme.colors.danger : r.status === 'warn' ? theme.colors.accent : theme.colors.border;
  const missingTeam = r.issues.some((i) => i.level === 'error' && (i.field === 'home_team' || i.field === 'away_team') && i.msg.startsWith('No team called'));
  return (
    <View style={[st.row, { borderLeftColor: edge }, skipped && st.rowSkipped]}>
      <View style={st.rowHead}>
        <Text style={st.line}>#{r.line}</Text>
        <Text style={[textStyles.muted, st.flex]} numberOfLines={1}>{when}</Text>
        {created ? (
          <Text style={st.done}>✓ Created</Text>
        ) : (
          <TouchableOpacity onPress={onSkip} accessibilityRole="button" accessibilityLabel={skipped ? `Restore row ${r.line}` : `Skip row ${r.line}`} hitSlop={8}>
            <Text style={skipped ? st.restore : st.skip}>{skipped ? 'Restore' : '✕'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={st.teams} numberOfLines={2}>
        {d ? `${getSport(d.sport).icon} ` : ''}{home} <Text style={st.vs}>vs</Text> {away}
      </Text>
      {meta ? <Text style={textStyles.muted} numberOfLines={1}>{meta}</Text> : null}
      {!skipped && !created && r.issues.map((i, k) => (
        <View key={k} style={st.issue}>
          <Text style={[st.issueText, { color: i.level === 'error' ? theme.colors.danger : theme.colors.accent }]}>
            {i.level === 'error' ? '✕' : '⚠'} {i.msg}
          </Text>
          {i.fix && <SelectChip label={`Use ${i.fix.name}`} active={false} onPress={() => onFix(r.line, i.field, i.fix!.name)} />}
        </View>
      ))}
      {!skipped && !created && missingTeam && (
        <TouchableOpacity onPress={onAddTeams} accessibilityRole="link"><Text style={st.link}>Add teams to the tournament →</Text></TouchableOpacity>
      )}
      {skipped && <Text style={textStyles.muted}>Skipped — won't be created.</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(8) },
  card: { gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  preview: { gap: theme.spacing(3) },
  flex: { flex: 1 },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  row: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    borderLeftWidth: 4, padding: theme.spacing(3), gap: theme.spacing(1.5),
  },
  rowSkipped: { opacity: 0.55 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  line: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  teams: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  vs: { color: theme.colors.textMuted, fontWeight: '400' },
  issue: { gap: theme.spacing(1.5), alignItems: 'flex-start' },
  issueText: { fontSize: theme.font.small, fontWeight: '600' },
  skip: { color: theme.colors.danger, fontSize: theme.font.h3, fontWeight: '800', paddingHorizontal: theme.spacing(1) },
  restore: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  done: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  footer: { padding: theme.spacing(4), gap: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bg },
});
