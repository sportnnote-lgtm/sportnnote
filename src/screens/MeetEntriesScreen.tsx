/** SD-128 — a meet's entries desk: an athletes × events matrix per age group
 *  and gender (tick to enter; events with a start list take a late entry or a
 *  scratch straight from the grid), per-athlete event caps from the meet
 *  ("max 3 individual events + 1 relay", over-the-cap warnings and an
 *  organiser override), and bulk add — paste a school's list to create the
 *  athletes (event-only when they're on no roster) and enter them. Event setup
 *  pre-fills from the ticks. Every results-engine sport; athletics and
 *  swimming also show their school programme's events before they're set up. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import type { RootStackParamList } from '../navigation/types';
import { useTournamentById, useOrganizations } from '../data/hooks';
import { useAuth } from '../core/auth';
import { canOrganize } from '../core/roles';
import { canManageTournament } from '../core/org';
import { getMyPlayerId, getPlayers } from '../data/repos';
import { getMeet } from '../data/resultsStore';
import { useMeetEntries, type MeetAthlete } from '../data/useMeetEntries';
import {
  updateEntriesDoc, lateAddEntry, previewLateEntry, scratchEntry, reinstateEntry, createEventAthlete,
} from '../data/meetEntriesStore';
import {
  AGE_GROUPS, categoryLabel, swimMeetSettings, entryEvents, cellState, entryCount, capState, wouldExceed, shortLabel, inGroup, toggleTick, setOverride,
  capsText, tickedFor, parseBulk, findDuplicates, ageGroupFor, yearsOn, slotKey, matchTeam, SCRATCH_REASONS, disciplineOf,
  type EntryEvent, type MeetEvent, type MeetEntriesDoc, type EntryCaps, type BulkRow, type DupMatch, type Category,
} from '../data/results';
import { isEventSport, eventWords, type EventSport } from '../sports/eventSports';
import type { SportId } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type G = 'M' | 'F' | 'X';
const NAME_W = 136;
const CELL_W = 52;
const ROW_H = 44;

export default function MeetEntriesScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'MeetEntries'>>();
  const tournamentId = params.tournamentId;
  const sport = (params.sport && isEventSport(params.sport) ? params.sport : 'athletics') as EventSport;
  const words = eventWords(sport);
  const tournament = useTournamentById(tournamentId);
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { void getMyPlayerId(profile?.id).then(setMe).catch(() => setMe(null)); }, [profile?.id]);
  const canManage = canOrganize(profile?.role) || (!!tournament && canManageTournament(tournament, orgs, me));

  const { sources, players, athletes, doc, setDoc, loading, reload } = useMeetEntries(tournamentId, sport);
  const [meet, setMeet] = useState<MeetEvent[]>([]);
  const loadMeet = useCallback(async () => {
    const ps = await getPlayers();
    const nm = new Map(ps.map((p) => [p.id, p.fullName]));
    setMeet(await getMeet(tournamentId, (id) => nm.get(id) ?? 'Athlete', sport));
  }, [tournamentId, sport]);
  useFocusEffect(useCallback(() => { void loadMeet(); reload(); }, [loadMeet, reload]));

  const [age, setAge] = useState<string>('U14');
  const [gender, setGender] = useState<G>('M');
  const course = sport === 'swimming' ? swimMeetSettings(tournament?.formats?.swimming as Record<string, unknown> | undefined).course : undefined;
  const group = { age, gender, course };
  const cols = useMemo(() => entryEvents(sport, meet, group), [sport, meet, age, gender, course]); // eslint-disable-line react-hooks/exhaustive-deps
  // every column of every group the meet uses — the caps count the whole meet
  const allCols = useMemo(() => {
    const out: EntryEvent[] = [];
    const groups = new Set(meet.map((e) => `${e.category?.age ?? 'Open'}|${e.category?.gender ?? 'X'}`));
    for (const ticks of Object.values(doc.ticks ?? {})) for (const s of ticks) { const [a, g] = (s.split('@')[1] ?? '').split('-'); if (a && g) groups.add(`${a === 'open' ? 'Open' : a}|${g}`); }
    groups.add(`${age}|${gender}`);
    for (const k of groups) { const [a, g] = k.split('|'); out.push(...entryEvents(sport, meet, { age: a, gender: g as G, course })); }
    return out;
  }, [sport, meet, doc.ticks, age, gender, course]);

  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const cat: Category = { age, gender };
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return athletes.filter((a) => (!q || a.name.toLowerCase().includes(q)) && (showAll || q || inGroup(a, cat) || cols.some((c) => cellState(a.id, c, doc) !== 'none')));
  }, [athletes, query, showAll, age, gender, cols, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => new Map(athletes.map((a) => [a.id, entryCount(a.id, allCols, doc)])), [athletes, allCols, doc]);
  const over = athletes.filter((a) => capState(counts.get(a.id)!, doc.caps).over);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<{ a: MeetAthlete; ev: EntryEvent } | null>(null);
  const [reason, setReason] = useState('');

  const saveDoc = async (change: (d: MeetEntriesDoc) => MeetEntriesDoc) => {
    setDoc(change(doc)); // optimistic
    try { setDoc(await updateEntriesDoc(tournamentId, sport, change)); } catch (e) { setError((e as Error).message); reload(); }
  };

  /** Over the cap? Ask; YES = the organiser's override for this athlete. */
  const capOk = async (a: MeetAthlete, ev: EntryEvent): Promise<boolean> => {
    const ex = wouldExceed(counts.get(a.id) ?? { individual: 0, relay: 0 }, ev.relay, doc.caps);
    if (!ex || doc.overrides?.includes(a.id)) return true;
    const ok = await askConfirm({ title: `${a.name} is at the limit`, message: `Entering ${ev.label} puts them ${ex}. ${capsText(doc.caps)}. Enter anyway as an organiser override?`, yesLabel: 'Yes, override the cap', noLabel: 'No, leave it', tone: 'caution' });
    if (ok) await saveDoc((d) => setOverride(d, a.id, true));
    return ok;
  };

  const tap = async (a: MeetAthlete, ev: EntryEvent) => {
    setError(null); setInfo(null);
    if (!canManage) return;
    const s = cellState(a.id, ev, doc);
    if (ev.eventKey && ev.phaseStatus === 'completed') { setInfo(`${ev.label}: the first round is closed — open the event to change it.`); return; }
    if (ev.eventKey && ev.relay) { setInfo(`${ev.label}: relay teams are changed on the event page (🗂 Entries → Late entry).`); return; }
    if (!ev.eventKey) {
      if (s === 'ticked') { await saveDoc((d) => toggleTick(d, a.id, ev.slot, false)); return; }
      if (!(await capOk(a, ev))) return;
      await saveDoc((d) => toggleTick(d, a.id, ev.slot, true));
      return;
    }
    if (s === 'entered') { setSel({ a, ev }); setReason(''); return; }
    if (s === 'scratched') {
      const en = ev.entries?.find((e) => e.athleteId === a.id);
      if (!en || !ev.phaseId) return;
      const ok = await askConfirm({ title: `Reinstate ${a.name}?`, message: `Back on the ${ev.label} start list in the same heat and lane.`, yesLabel: 'Yes, reinstate', noLabel: 'No, leave scratched', tone: 'caution' });
      if (!ok) return;
      try { setBusy(true); await reinstateEntry(ev.phaseId, en.id); await loadMeet(); setInfo(`${a.name} is back in ${ev.label}.`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      return;
    }
    // not on an existing start list → late entry
    if (!ev.phaseId) return;
    if (!(await capOk(a, ev))) return;
    try {
      const pv = await previewLateEntry(ev.phaseId);
      if (pv.reason) { setInfo(`${ev.label}: ${pv.reason}`); return; }
      const where = [pv.place.newHeat ? `a new heat ${pv.place.heat}` : `heat ${pv.place.heat}`, pv.place.lane != null ? `lane ${pv.place.lane}` : ''].filter(Boolean).join(', ');
      const ok = await askConfirm({ title: `Late entry: ${a.name}?`, message: `The ${ev.label} start list exists — ${a.name} goes into ${where}. Everyone else keeps their place.`, yesLabel: 'Yes, add late entry', noLabel: 'No, cancel', tone: 'caution' });
      if (!ok) return;
      setBusy(true);
      await lateAddEntry(ev.phaseId, { playerId: a.id, name: a.name, team: a.team, bib: a.bib });
      await loadMeet();
      setInfo(`${a.name} added to ${ev.label} (${where}).`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const doScratch = async () => {
    if (!sel?.ev.phaseId) return;
    const en = sel.ev.entries?.find((e) => e.athleteId === sel.a.id);
    if (!en) return;
    if (!reason) { setError('Pick a reason.'); return; }
    const ok = await askConfirm({ title: `Scratch ${sel.a.name} from ${sel.ev.label}?`, message: `Listed as DNS (${reason}). The lane stays empty and they can't go on to a later round.`, yesLabel: 'Yes, scratch', noLabel: 'No, keep them', tone: 'danger' });
    if (!ok) return;
    try { setBusy(true); await scratchEntry(sel.ev.phaseId, en.id, reason); await loadMeet(); setInfo(`${sel.a.name} scratched from ${sel.ev.label} (${reason}).`); setSel(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const setCaps = (c: EntryCaps) => void saveDoc((d) => ({ ...d, caps: c.individual == null && c.relay == null ? undefined : c }));
  const setUp = (ev: EntryEvent) => nav.navigate('AthleticsEventSetup', { tournamentId, ...(sport !== 'athletics' ? { sport: sport as 'swimming' } : {}), discipline: ev.discipline, age: ev.category?.age, gender: ev.category?.gender });
  const planned = cols.filter((c) => !c.eventKey && tickedFor(doc, c.slot).length);
  const setupable = sport === 'athletics' || sport === 'swimming';

  if (!loading && !canManage) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><Text style={[textStyles.muted, { padding: 16 }]}>Only the meet's organisers manage entries.</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`📋 ${words.icon} Meet entries`} subtitle={tournament?.name} />

        <CapsCard caps={doc.caps} onChange={setCaps} />

        <Card style={{ gap: theme.spacing(2) }}>
          <View style={st.wrap}>{AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Boys / Men" active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label="Girls / Women" active={gender === 'F'} onPress={() => setGender('F')} />
            <SelectChip label="Mixed" active={gender === 'X'} onPress={() => setGender('X')} />
          </View>
          <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder={`Search ${words.athletes}`} placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search athletes" />
          <SelectChip label={`Show every ${words.athletes.replace(/s$/, '')} (not just ${categoryLabel(cat)})`} active={showAll} onPress={() => setShowAll((v) => !v)} />
        </Card>

        <FormError message={error} />
        {info ? <Text style={st.info}>{info}</Text> : null}
        {over.length > 0 && (
          <Card style={st.warn}>
            <Text style={[textStyles.body, st.bold]}>⚠ {over.length} {over.length === 1 ? words.athletes.replace(/s$/, '') : words.athletes} over the limit</Text>
            {over.slice(0, 8).map((a) => {
              const cs = capState(counts.get(a.id)!, doc.caps, doc.overrides?.includes(a.id));
              return <Text key={a.id} style={textStyles.muted}>{a.name} — {cs.text}{cs.overridden ? ' · organiser override' : ''}</Text>;
            })}
            <Text style={textStyles.muted}>{capsText(doc.caps)}.</Text>
          </Card>
        )}

        <Text style={textStyles.h3}>{categoryLabel(cat)} · {rows.length} {rows.length === 1 ? words.athletes.replace(/s$/, "") : words.athletes}</Text>
        {cols.length === 0 ? (
          <Text style={textStyles.muted}>No {categoryLabel(cat)} events yet{setupable ? '' : ' — add them from the meet page first'}.</Text>
        ) : (
          <Grid cols={cols} rows={rows} doc={doc} counts={counts} busy={busy} onTap={(a, ev) => void tap(a, ev)} />
        )}
        <Text style={textStyles.muted}>✓ on the start list · ☑ entered (start list not made yet) · R relay team · S scratched. Tap a ticked box to untick; tap ✓ to scratch; tap S to reinstate. A tick on an event that already has a start list is a late entry.</Text>
        {loading ? <Text style={textStyles.muted}>Loading…</Text> : null}

        {sel && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Scratch {sel.a.name} from {sel.ev.label}?</Text>
            <View style={st.wrap}>{SCRATCH_REASONS.filter((r) => r !== 'Wrong entry').map((r) => <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View>
            <Button label={busy ? 'Scratching…' : 'Scratch'} variant="danger" onPress={() => void doScratch()} disabled={busy} />
            <Button label="Cancel" variant="ghost" onPress={() => setSel(null)} />
          </Card>
        )}

        {setupable && planned.length > 0 && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Make the start lists</Text>
            <Text style={textStyles.muted}>Each opens event setup with the entered {words.athletes} ticked (seeds, rounds and lanes as usual).</Text>
            {planned.map((c) => (
              <Button key={c.slot} variant="ghost" label={`${c.label} ${categoryLabel(c.category)} — ${tickedFor(doc, c.slot).length} entered →`} onPress={() => setUp(c)} />
            ))}
          </Card>
        )}

        <BulkAdd sport={sport} tournamentId={tournamentId} doc={doc} meet={meet} athletes={athletes} players={players} sources={sources} course={course}
          onDone={async (msg, change) => { if (change) await saveDoc(change); reload(); await loadMeet(); setInfo(msg); }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------------------------- caps ---------------------------------- */

function CapsCard({ caps, onChange }: { caps?: EntryCaps; onChange: (c: EntryCaps) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <TouchableOpacity accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={st.head}>
        <Text style={[textStyles.body, st.bold, { flex: 1 }]}>⚖ {capsText(caps)}</Text>
        <Text style={textStyles.muted}>{open ? 'Done' : 'Change'}</Text>
      </TouchableOpacity>
      {open && (
        <>
          <Text style={st.label}>Individual events</Text>
          <View style={st.wrap}>{[undefined, 1, 2, 3, 4, 5].map((n) => <SelectChip key={String(n)} label={n == null ? 'No limit' : String(n)} active={caps?.individual === n} onPress={() => onChange({ ...caps, individual: n })} />)}</View>
          <Text style={st.label}>Relays</Text>
          <View style={st.wrap}>{[undefined, 0, 1, 2, 3].map((n) => <SelectChip key={String(n)} label={n == null ? 'No limit' : String(n)} active={caps?.relay === n} onPress={() => onChange({ ...caps, relay: n })} />)}</View>
          <Button label="School rule: 3 individual + 1 relay" variant="ghost" onPress={() => onChange({ individual: 3, relay: 1 })} />
          <Text style={textStyles.muted}>Over the limit shows a warning; an organiser can still enter the {''}athlete (override).</Text>
        </>
      )}
    </Card>
  );
}

/* ---------------------------------- grid ---------------------------------- */

function Grid({ cols, rows, doc, counts, busy, onTap }: {
  cols: EntryEvent[]; rows: MeetAthlete[]; doc: MeetEntriesDoc; counts: Map<string, { individual: number; relay: number }>; busy: boolean; onTap: (a: MeetAthlete, ev: EntryEvent) => void;
}) {
  return (
    <View style={st.grid}>
      <View style={{ width: NAME_W }}>
        <View style={[st.hcell, { width: NAME_W, alignItems: 'flex-start' }]}><Text style={st.hTxt}>Athlete · events</Text></View>
        {rows.map((a) => {
          const cs = capState(counts.get(a.id) ?? { individual: 0, relay: 0 }, doc.caps, doc.overrides?.includes(a.id));
          return (
            <View key={a.id} style={[st.nameCell, { width: NAME_W }]}>
              <Text style={st.name} numberOfLines={1}>{a.name}</Text>
              <Text style={[st.sub, cs.over && !cs.overridden && st.overTxt]} numberOfLines={1}>{cs.text}{cs.over ? (cs.overridden ? ' ✔︎' : ' ⚠') : ''}{a.team ? ` · ${a.team.name}` : ''}{a.eventOnly ? ' · event-only' : ''}</Text>
            </View>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexDirection: 'column' }}>
        <View style={{ flexDirection: 'row' }}>
          {cols.map((c) => (
            <View key={c.slot + (c.eventKey ?? '')} style={st.hcell}>
              <Text style={st.hTxt} numberOfLines={2}>{shortLabel(c.discipline)}</Text>
              <Text style={st.hSub}>{c.eventKey ? (c.phaseStatus === 'completed' ? '🔒' : 'list') : ''}</Text>
            </View>
          ))}
        </View>
        {rows.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row' }}>
            {cols.map((c) => {
              const s = cellState(a.id, c, doc);
              const mark = s === 'entered' ? '✓' : s === 'ticked' ? '☑' : s === 'member' ? 'R' : s === 'scratched' ? 'S' : '';
              return (
                <TouchableOpacity key={c.slot + (c.eventKey ?? '')} accessibilityRole="checkbox" accessibilityLabel={`${a.name}, ${disciplineOf(c.discipline)?.label ?? c.label}`}
                  accessibilityState={{ checked: s === 'entered' || s === 'ticked' || s === 'member', disabled: busy }} disabled={busy} onPress={() => onTap(a, c)}
                  style={[st.cell, (s === 'entered' || s === 'member') && st.cellIn, s === 'ticked' && st.cellTick, s === 'scratched' && st.cellScr]}>
                  <Text style={[st.cellTxt, s === 'scratched' && { color: theme.colors.danger }]}>{mark}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* -------------------------------- bulk add -------------------------------- */

function BulkAdd({ sport, tournamentId, doc, meet, athletes, players, sources, course, onDone }: {
  sport: EventSport; tournamentId: string; doc: MeetEntriesDoc; meet: MeetEvent[]; athletes: MeetAthlete[];
  players: { id: string; fullName: string; dob?: string; age?: number }[]; sources: { name: string; teamId?: string; colorHex?: string; playerIds: string[] }[];
  course?: Category['course'];
  onDone: (msg: string, change?: (d: MeetEntriesDoc) => MeetEntriesDoc) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<BulkRow[] | null>(null);
  const [dups, setDups] = useState<DupMatch[]>([]);
  const [createAnyway, setCreateAnyway] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = eventWords(sport);

  const check = () => {
    setError(null);
    const rows = parseBulk(text, sport);
    if (!rows.length) { setError('Paste one athlete per line.'); return; }
    setParsed(rows);
    setDups(findDuplicates(rows, players));
    setCreateAnyway(new Set());
  };
  const dupOf = (line: number) => dups.find((d) => d.line === line);
  const usable = (parsed ?? []).filter((r) => !r.error && dupOf(r.line)?.kind !== 'inList');

  const add = async () => {
    setError(null);
    if (!usable.length) return;
    const ok = await askConfirm({ title: `Add ${usable.length} ${usable.length === 1 ? words.athletes.replace(/s$/, '') : words.athletes}?`, message: `New ones are created for this meet only (event-only, no account); matches to existing players are used as they are. Events named on a row are entered (a late entry where the start list exists).`, yesLabel: 'Yes, add them', noLabel: 'No, go back', tone: 'caution' });
    if (!ok) return;
    setBusy(true);
    let created = 0, reused = 0, ticked = 0, lateAdds = 0;
    const skipped: string[] = [];
    const newAthletes: Record<string, NonNullable<MeetEntriesDoc['athletes']>[string]> = {};
    const ticks: { id: string; slot: string }[] = [];
    try {
      for (const r of usable) {
        const d = dupOf(r.line);
        const team = matchTeam(r.house, sources);
        let id: string;
        if (d?.playerId && !createAnyway.has(r.line)) { id = d.playerId; reused += 1; }
        else {
          const p = await createEventAthlete({ fullName: r.name, gender: r.gender, dob: r.dob, houseName: team?.name ?? r.house, houseColor: team?.colorHex }, sport as SportId);
          id = p.id; created += 1;
        }
        const onRoster = sources.some((s) => s.playerIds.includes(id));
        newAthletes[id] = { ...(doc.athletes?.[id] ?? {}), ...(onRoster ? {} : { eventOnly: true }), ...(r.bib ? { bib: r.bib } : {}), ...(r.age ? { age: r.age } : {}), ...(r.gender ? { gender: r.gender } : {}), ...(r.house && !team ? { house: r.house } : {}) };
        const ag = r.age ?? ageGroupFor(r.dob ? yearsOn(r.dob) : undefined);
        for (const k of r.events) {
          if (!ag || !r.gender) { skipped.push(`${r.name}: ${shortLabel(k)} (no age group / gender)`); continue; }
          const relay = !!disciplineOf(k)?.teamSize;
          const ev = entryEvents(sport, meet, { age: ag, gender: r.gender, course }).find((e) => e.discipline === k);
          if (!ev) { skipped.push(`${r.name}: ${shortLabel(k)} isn't on the ${ag} programme`); continue; }
          if (ev.eventKey && ev.phaseId && !relay) {
            try { await lateAddEntry(ev.phaseId, { playerId: id, name: r.name, team: team ? { id: team.teamId, name: team.name, colorHex: team.colorHex } : r.house ? { name: r.house } : undefined, bib: r.bib }); lateAdds += 1; }
            catch (e) { skipped.push(`${r.name}: ${ev.label} — ${(e as Error).message}`); }
          } else if (ev.eventKey) skipped.push(`${r.name}: ${ev.label} — pick relay teams on the event page`);
          else { ticks.push({ id, slot: slotKey(k, ev.category) }); ticked += 1; }
        }
      }
      const change = (d0: MeetEntriesDoc): MeetEntriesDoc => {
        let d: MeetEntriesDoc = { ...d0, athletes: { ...(d0.athletes ?? {}), ...newAthletes } };
        for (const t of ticks) d = toggleTick(d, t.id, t.slot, true);
        return d;
      };
      const dropped = (parsed ?? []).length - usable.length;
      setParsed(null); setText(''); setOpen(false);
      await onDone(`Added ${created + reused} (${created} new, ${reused} already on the app)${ticked ? ` · ${ticked} entries ticked` : ''}${lateAdds ? ` · ${lateAdds} late entries` : ''}${dropped ? ` · ${dropped} line${dropped === 1 ? '' : 's'} skipped` : ''}.${skipped.length ? ` Not entered: ${skipped.slice(0, 4).join('; ')}${skipped.length > 4 ? '…' : ''}` : ''}`, change);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <TouchableOpacity accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={st.head}>
        <Text style={[textStyles.body, st.bold, { flex: 1 }]}>📥 Bulk add — paste a list</Text>
        <Text style={textStyles.muted}>{open ? 'Close' : 'Open'}</Text>
      </TouchableOpacity>
      {open && (
        <>
          <Text style={textStyles.muted}>One {words.athletes.replace(/s$/, '')} per line: name, house / school, gender, date of birth (day/month/year) or age group, bib — and, if you like, events ("100m; LJ"). Copy straight from a spreadsheet (tabs work).</Text>
          <TextInput style={[st.input, st.area]} value={text} onChangeText={(t) => { setText(t); setParsed(null); }} multiline textAlignVertical="top"
            placeholder={sport === 'swimming' ? 'Meera Iyer, Blue House, G, 14/02/2013, 211, 50 free; 100 back' : 'Aarav Nair, Red House, B, 05/03/2012, 101, 100m; LJ'} placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Pasted list" />
          <Button label="Check the list" variant="ghost" onPress={check} disabled={!text.trim()} />
          <FormError message={error} />
          {parsed && (
            <View style={{ gap: 6 }}>
              {parsed.map((r) => {
                const d = dupOf(r.line);
                const ag = r.age ?? ageGroupFor(r.dob ? yearsOn(r.dob) : undefined);
                const status = r.error ? `⚠ ${r.error}` : d?.kind === 'inList' ? 'Same name and DOB as an earlier line — skipped' : d?.kind === 'same' ? (createAnyway.has(r.line) ? 'Will create a new player' : `Already on the app (${d.name}) — will use them`) : d?.kind === 'likely' ? (createAnyway.has(r.line) ? 'Will create a new player' : `Maybe ${d.name} (same name, age fits) — will use them`) : 'New — event-only';
                return (
                  <View key={r.line} style={st.bulkRow}>
                    <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{r.name || '—'}</Text>
                    <Text style={textStyles.muted} numberOfLines={2}>{[r.house, r.gender === 'M' ? 'Boy' : r.gender === 'F' ? 'Girl' : 'gender?', r.dob ?? r.age ?? 'age?', ag && !r.age ? ag : '', r.bib ? `bib ${r.bib}` : '', r.events.map(shortLabel).join(' '), r.unknown.length ? `? ${r.unknown.join(', ')}` : ''].filter(Boolean).join(' · ')}</Text>
                    <Text style={[st.sub, (r.error || d) && { color: theme.colors.accent }]}>{status}</Text>
                    {d && d.kind !== 'inList' && !r.error ? (
                      <SelectChip label="Create a new player instead" active={createAnyway.has(r.line)} onPress={() => setCreateAnyway((s) => { const n = new Set(s); if (n.has(r.line)) n.delete(r.line); else n.add(r.line); return n; })} />
                    ) : null}
                  </View>
                );
              })}
              <Button label={busy ? 'Adding…' : `Add ${usable.length}`} onPress={() => void add()} disabled={busy || !usable.length} />
            </View>
          )}
          {athletes.length ? null : <Text style={textStyles.muted}>Tip: add the houses as teams of the meet first, so pasted athletes score for them.</Text>}
        </>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  bold: { fontWeight: '800' },
  info: { color: theme.colors.primary, fontWeight: '700' },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing(3), minHeight: 44, color: theme.colors.text, backgroundColor: theme.colors.surface },
  area: { minHeight: 120, paddingTop: theme.spacing(2) },
  warn: { gap: 4, borderColor: theme.colors.danger, borderWidth: 1 },
  grid: { flexDirection: 'row', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.surface },
  hcell: { width: CELL_W, height: ROW_H, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderBottomWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  hTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  hSub: { color: theme.colors.textMuted, fontSize: 10 },
  nameCell: { height: ROW_H, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: theme.colors.border },
  name: { color: theme.colors.text, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.small },
  overTxt: { color: theme.colors.danger, fontWeight: '800' },
  cell: { width: CELL_W, height: ROW_H, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderLeftWidth: 1, borderColor: theme.colors.border },
  cellIn: { backgroundColor: 'rgba(61,220,151,0.18)' },
  cellTick: { backgroundColor: theme.colors.surfaceAlt },
  cellScr: { backgroundColor: theme.colors.surfaceAlt },
  cellTxt: { color: theme.colors.text, fontWeight: '800', fontSize: 16 },
  bulkRow: { gap: 2, padding: theme.spacing(2), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
});
