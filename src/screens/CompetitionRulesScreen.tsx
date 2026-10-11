/** SD-141 — Competition rules: every rule choice the results engine would
 *  otherwise make on its own for this event sport (lifting order, categories,
 *  false starts, wind and record rules, team scoring, ties, shoot-offs …),
 *  each with the standard default and a short explanation. The organiser sets
 *  them before the meet starts; once any result exists for the sport in the
 *  tournament they are read-only. Team sports in the same tournament link to
 *  their bans and walkover scores (SD-126 / SD-140 settings). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, ScreenTitle, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { AgeBasisNote } from '../components/results/AgeBasisNote';
import type { RootStackParamList } from '../navigation/types';
import { useTournamentById, useOrganizations } from '../data/hooks';
import { useAuth } from '../core/auth';
import { canOrganize } from '../core/roles';
import { canManageTournament } from '../core/org';
import { ageCutoff, type AgeBasis } from '../core/age';
import { getMyPlayerId } from '../data/repos';
import { meetAgeBasis } from '../data/useMeetAges';
import { getEntriesDoc } from '../data/meetEntriesStore';
import { getRulesLock, saveCompetitionRules, teamSportsOf, type RulesLock } from '../data/competitionRulesStore';
import { rulesFor, ruleShown, capsText, parseClassList, type EntryCaps, type RuleDef, type RuleValue } from '../data/results';
import { isEventSport } from '../sports/eventSports';
import { getSport } from '../sports/registry';
import type { SportId } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CAP_IND = [undefined, 1, 2, 3, 4, 5] as const;
const CAP_REL = [undefined, 1, 2, 3] as const;

export default function CompetitionRulesScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CompetitionRules'>>();
  const sport = params.sport;
  const tournament = useTournamentById(params.tournamentId);
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { void getMyPlayerId(profile?.id).then(setMe).catch(() => setMe(null)); }, [profile?.id]);
  const canManage = canOrganize(profile?.role) || (!!tournament && canManageTournament(tournament, orgs, me));

  const defs = useMemo(() => rulesFor(sport), [sport]);
  const saved = (tournament?.formats?.[sport as SportId] ?? {}) as Record<string, unknown>;
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [caps, setCaps] = useState<EntryCaps | null>(null);
  const [savedCaps, setSavedCaps] = useState<EntryCaps | null>(null);
  const [lock, setLock] = useState<RulesLock | null>(null);
  const [basis, setBasis] = useState<AgeBasis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, doc] = await Promise.all([getRulesLock(params.tournamentId, sport), getEntriesDoc(params.tournamentId, sport)]);
      setLock(l);
      setSavedCaps(doc.caps ?? null);
      setCaps(doc.caps ?? null);
    } catch (e) { setError((e as Error).message); }
  }, [params.tournamentId, sport]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // the draft starts from what is saved (the tournament refreshes on focus)
  useEffect(() => { if (tournament && !draft) setDraft({ ...saved }); }, [tournament]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = !!lock?.locked;
  const editable = canManage && !!lock && !locked;
  const values = draft ?? saved;
  const valueOf = (r: RuleDef): unknown => { const v = values[r.key]; return v === undefined || v === null || v === '' ? r.default : v; };
  const set = (k: string, v: RuleValue) => setDraft((d) => ({ ...(d ?? saved), [k]: v }));
  const name = isEventSport(sport) ? getSport(sport as SportId).name : sport;

  // what Save would write: only the keys that changed; a standard value is stored as "unset"
  const changes = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const r of defs) {
      if (r.kind === 'age' || r.kind === 'caps') continue;
      const now = values[r.key], was = saved[r.key];
      const norm = (v: unknown) => (v === undefined || v === null || v === '' || (v === r.default && !r.existing) ? undefined : v);
      if (norm(now) !== norm(was)) out[r.key] = norm(now);
    }
    return out;
  }, [defs, values, saved]);
  const capsChanged = JSON.stringify(caps ?? null) !== JSON.stringify(savedCaps ?? null);
  const dirty = Object.keys(changes).length > 0 || capsChanged;
  const listError = values.wlClasses === 'custom' && (!parseClassList(values.wlClassesM) || !parseClassList(values.wlClassesF))
    ? 'Our own list: type both lists as rising kg limits, e.g. "49, 55, 61, 67".' : null;

  const save = async () => {
    if (listError) { setError(listError); return; }
    if ((lock?.events ?? 0) > 0) {
      const ok = await askConfirm({ title: 'Apply to the events already set up?', message: `The ${lock!.events} ${name.toLowerCase()} event${lock!.events === 1 ? '' : 's'} already on the programme will use these rules too. None has a result yet.`, yesLabel: 'Yes, save rules', noLabel: 'No, keep editing', tone: 'caution' });
      if (!ok) return;
    }
    setBusy(true); setError(null); setInfo(null);
    try {
      const n = await saveCompetitionRules(params.tournamentId, sport, changes, capsChanged ? caps : undefined);
      setSavedCaps(caps);
      setInfo(`Competition rules saved${n ? ` — ${n} round${n === 1 ? '' : 's'} already set up use them` : ''}.`);
      nav.goBack();
    } catch (e) { setError((e as Error).message); await load(); } finally { setBusy(false); }
  };
  const reset = async () => {
    const ok = await askConfirm({ title: 'Back to the standard rules?', message: 'Every choice on this page goes back to its standard default. Nothing is saved until you tap Save rules.', yesLabel: 'Yes, use standard', noLabel: 'No, keep mine', tone: 'caution' });
    if (!ok) return;
    const d: Record<string, unknown> = { ...(draft ?? saved) };
    for (const r of defs) if (r.kind === 'choice' || r.kind === 'text') d[r.key] = r.default;
    setDraft(d);
    setCaps(null);
  };

  const groups = useMemo(() => {
    const m = new Map<string, RuleDef[]>();
    for (const r of defs) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m];
  }, [defs]);
  const teamSports = tournament ? teamSportsOf(tournament.sports, isEventSport) : [];

  if (!tournament) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="📜 Competition rules" subtitle={`${tournament.name} · ${name}`} />
        <Text style={textStyles.muted}>Pick these before the meet starts. The standard rule is already chosen for each one and says where it comes from. Rules marked “verify” were set from memory — check them against your federation or school board circular.</Text>
        {!lock ? <Text style={textStyles.muted}>Checking for results…</Text> : locked ? (
          <Card style={st.lockCard}>
            <Text style={st.bold}>🔒 Locked — {name.toLowerCase()} results exist in this tournament</Text>
            <Text style={textStyles.muted}>Every event of the meet is scored by the same rules, so they can’t change once results are in. To change one, reopen and clear the results first, or start a new tournament.</Text>
          </Card>
        ) : !canManage ? (
          <Text style={textStyles.muted}>Only the tournament’s organisers can change these.</Text>
        ) : null}

        {groups.map(([group, list]) => (
          <View key={group} style={{ gap: theme.spacing(2) }}>
            <Text style={st.group}>{group}</Text>
            {list.filter((r) => ruleShown(r, values)).map((r) => (
              <Card key={r.key} style={{ gap: theme.spacing(2) }}>
                <Text style={st.bold}>{r.label}</Text>
                <Text style={textStyles.muted}>{r.help}</Text>
                {r.kind === 'choice' && (
                  <View style={{ gap: theme.spacing(1) }} accessibilityRole="radiogroup">
                    {r.choices!.map((c) => (
                      <Choice key={String(c.value)} label={c.label} standard={c.value === r.default} on={valueOf(r) === c.value} disabled={!editable} onPress={() => set(r.key, c.value)} />
                    ))}
                  </View>
                )}
                {r.kind === 'text' && (
                  editable
                    ? <TextField label={r.label} value={String(values[r.key] ?? '')} onChange={(t) => set(r.key, t)} placeholder="49, 55, 61, 67, 73" autoCapitalize="none" />
                    : <Text style={textStyles.body}>{String(values[r.key] ?? '') || '—'}</Text>
                )}
                {r.kind === 'age' && (
                  <AgeBasisNote tournament={tournament} sport={sport} basis={basis ?? meetAgeBasis(tournament, sport)} cutoff={ageCutoff(basis ?? meetAgeBasis(tournament, sport), tournament.startDate)} canEdit={editable} onSaved={setBasis} />
                )}
                {r.kind === 'caps' && (
                  <View style={{ gap: theme.spacing(2) }}>
                    <Text style={st.label}>Individual events</Text>
                    <View style={st.wrap}>
                      {CAP_IND.map((n) => <SelectChip key={`i${n ?? 'x'}`} label={n == null ? 'No limit · standard' : `Max ${n}`} active={(caps?.individual ?? undefined) === n} disabled={!editable} onPress={() => setCaps({ ...(caps ?? {}), individual: n })} />)}
                    </View>
                    <Text style={st.label}>Relays</Text>
                    <View style={st.wrap}>
                      {CAP_REL.map((n) => <SelectChip key={`r${n ?? 'x'}`} label={n == null ? 'No limit · standard' : `Max ${n}`} active={(caps?.relay ?? undefined) === n} disabled={!editable} onPress={() => setCaps({ ...(caps ?? {}), relay: n })} />)}
                    </View>
                    <Text style={textStyles.muted}>{capsText(caps ?? undefined)}. The entries desk shows the same limit.</Text>
                  </View>
                )}
                <Text style={st.source}>Source: {r.source}</Text>
              </Card>
            ))}
          </View>
        ))}

        {teamSports.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={st.group}>Team sports in this tournament</Text>
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={st.bold}>Bans and walkover scores</Text>
              <Text style={textStyles.muted}>Each team sport has its own suspension rules (cards that lead to a ban) and the score a walkover counts as. The federation defaults are already set — open a sport to check or change them.</Text>
              <View style={st.wrap}>
                {teamSports.map((s) => <Button key={s} label={`⚙ ${getSport(s).name}`} variant="ghost" onPress={() => nav.navigate('SportSettings', { sport: s, tournamentId: tournament.id })} />)}
              </View>
            </Card>
          </View>
        )}

        <FormError message={error ?? (editable ? listError : null)} />
        {info ? <Text style={textStyles.muted}>{info}</Text> : null}
        {editable && (
          <View style={st.wrap}>
            <Button label={busy ? 'Saving…' : dirty ? 'Save rules' : saved.rulesSetAt ? 'Saved' : 'Use these rules'} onPress={() => void save()} disabled={busy || (!dirty && !!saved.rulesSetAt)} />
            <Button label="Back to standard" variant="ghost" onPress={() => void reset()} disabled={busy} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One option: a radio row whose label wraps (long rule names fit a 375 px phone). */
function Choice({ label, standard, on, disabled, onPress }: { label: string; standard: boolean; on: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} accessibilityLabel={`${label}${standard ? ', standard' : ''}`}
      disabled={disabled} onPress={onPress} style={[st.choice, on && st.choiceOn, disabled && !on && { opacity: 0.6 }]}>
      <View style={[st.dot, on && st.dotOn]} />
      <Text style={[st.choiceTxt, on && st.bold]}>{label}{standard ? <Text style={st.std}>  · standard</Text> : null}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  choiceOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceAlt },
  choiceTxt: { flex: 1, color: theme.colors.text },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: theme.colors.textMuted },
  dotOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  std: { color: theme.colors.textMuted, fontWeight: '600', fontSize: theme.font.small },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) },
  group: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(2) },
  bold: { color: theme.colors.text, fontWeight: '800' },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  source: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  lockCard: { gap: theme.spacing(1), borderColor: theme.colors.accent },
});
