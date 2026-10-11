/** SD-128 — the organiser's entries tools on an event page: ＋ Late entry (into
 *  a heat with room, a free lane or a new heat), Scratch with a reason (DNS;
 *  the lane stays empty and they can't go on to the next round), and Delete
 *  event (refused with results unless "delete results too"). Every action is
 *  confirmed. Works for every results-engine sport. */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { askConfirm } from '../ConfirmSheet';
import { Button, Card, FormError, SelectChip, textStyles } from '../ui';
import type { FieldEntry, FieldEvent, SportId } from '../../core/types';
import {
  lateAddVerdict, placeLateEntry, scratchVerdict, isScratched, SCRATCH_REASONS, inGroup, readDob, yearsOn, crewEventOf, categoryLabel,
  type DisciplineDef, type EntryResult, type PhaseFormat,
} from '../../data/results';
import { lateAddEntry, scratchEntry, reinstateEntry, removeEntry, checkDeleteEvent, deleteResultsEvent, createEventAthlete, updateEntriesDoc } from '../../data/meetEntriesStore';
import { useMeetEntries, type MeetAthlete, type MeetSource } from '../../data/useMeetEntries';
import { eventWords } from '../../sports/eventSports';
import { useRegion, dateOrderWords, exampleDate } from '../../core/region';

type Mode = null | 'add' | 'scratch';

export function EntriesPanel({ phase, f, def, entries, nameOf, onChanged, onDeleted }: {
  phase: FieldEvent; f: PhaseFormat; def: DisciplineDef; entries: FieldEntry[]; nameOf: (id: string) => string;
  onChanged: () => Promise<void> | void; onDeleted: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = entries.map((e) => ({ result: (e.result ?? {}) as EntryResult }));
  const late = lateAddVerdict(f, phase.status, rows);
  const eventTitle = f.eventTitle ?? def.label;
  const words = eventWords(def.sport);

  const del = async () => {
    setError(null);
    try {
      const chk = await checkDeleteEvent(f.eventKey);
      const ok = chk.hasResults
        ? await askConfirm({
          title: `${eventTitle} has results`, tone: 'danger', noLabel: 'No, keep the event', yesLabel: 'Yes, delete event and results',
          message: `Deleting it also deletes its results: every mark, ${chk.finished ? 'its medals and points in the house table, and any record it set (that goes back to the previous holder)' : 'and the rounds so far'}. ${chk.phases > 1 ? `All ${chk.phases} rounds go. ` : ''}This can't be undone.`,
        })
        : await askConfirm({
          title: `Delete ${eventTitle}?`, tone: 'danger', noLabel: 'No, keep it', yesLabel: 'Yes, delete event',
          message: `The event and its start list (${chk.entries} ${chk.entries === 1 ? 'entry' : 'entries'}) are removed from the programme. Nothing has been scored yet. This can't be undone.`,
        });
      if (!ok) return;
      setBusy(true);
      await deleteResultsEvent(f.eventKey, { withResults: chk.hasResults });
      onDeleted();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>🗂 Entries</Text>
      <View style={st.wrap}>
        {late.ok && <SelectChip label="＋ Late entry" active={mode === 'add'} onPress={() => { setInfo(null); setMode(mode === 'add' ? null : 'add'); }} />}
        {phase.status !== 'completed' && <SelectChip label="✕ Scratch" active={mode === 'scratch'} onPress={() => { setInfo(null); setMode(mode === 'scratch' ? null : 'scratch'); }} />}
        <SelectChip label="🗑 Delete event" active={false} onPress={() => void del()} disabled={busy} />
      </View>
      {!late.ok && phase.status !== 'completed' ? <Text style={textStyles.muted}>Late entries: {late.reason}</Text> : null}
      <FormError message={error} />
      {info ? <Text style={st.info}>{info}</Text> : null}
      {mode === 'add' && (
        <LateEntry phase={phase} f={f} def={def} entries={entries} words={words.athletes}
          onDone={async (msg) => { setInfo(msg); setMode(null); await onChanged(); }} />
      )}
      {mode === 'scratch' && <ScratchList phase={phase} entries={entries} nameOf={nameOf} onChanged={async (msg) => { setInfo(msg); await onChanged(); }} />}
    </Card>
  );
}

/* --------------------------------- late entry --------------------------------- */

function LateEntry({ phase, f, def, entries, words, onDone }: {
  phase: FieldEvent; f: PhaseFormat; def: DisciplineDef; entries: FieldEntry[]; words: string; onDone: (msg: string) => Promise<void>;
}) {
  const sport = def.sport as SportId;
  const region = useRegion(); // SD-150: typed DOBs follow the region's date order
  const { sources, athletes, doc } = useMeetEntries(phase.tournamentId, sport);
  const team = !!def.teamSize;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [heat, setHeat] = useState<number | 'new' | undefined>(undefined);
  const [bib, setBib] = useState('');
  // an individual: from the meet's athletes, or a new one (on no roster)
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [pick, setPick] = useState<MeetAthlete | null>(null);
  const [fresh, setFresh] = useState(false);
  const [nName, setNName] = useState('');
  const [nGender, setNGender] = useState<'M' | 'F' | undefined>(f.category?.gender === 'M' || f.category?.gender === 'F' ? f.category.gender : undefined);
  const [nDob, setNDob] = useState('');
  const [nHouse, setNHouse] = useState<MeetSource | null>(null);
  const [nHouseText, setNHouseText] = useState('');
  // a relay / crew: the team and its members
  const [src, setSrc] = useState<MeetSource | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const boat = team ? crewEventOf(def.key)?.boat : undefined;
  const need = boat ? boat.seats + (boat.cox ? 1 : 0) : def.teamSize ?? 0;

  const onList = new Set(entries.map((e) => e.playerId).filter(Boolean));
  const cat = f.category ?? {};
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return athletes.filter((a) => !onList.has(a.id) && (!q || a.name.toLowerCase().includes(q)) && (!eligibleOnly || inGroup(a, cat))).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes, query, eligibleOnly, entries]);
  const placeRows = entries.map((e) => ({ heat: e.groupNo, lane: (e.result as EntryResult | null)?.lane, order: (e.result as EntryResult | null)?.order }));
  const place = placeLateEntry(placeRows, def, { heats: f.heats, heat });
  const heats = [...new Set(entries.map((e) => e.groupNo))].sort((a, b) => a - b);
  const where = [
    place.newHeat ? `a new heat ${place.heat}` : heats.length > 1 ? `heat ${place.heat}` : '',
    place.lane != null ? `lane ${place.lane}` : def.tie === 'road' ? 'last on the start list' : `number ${place.order} in the order`,
  ].filter(Boolean).join(', ');
  const teamCount = (s: MeetSource) => entries.filter((e) => !e.playerId && ((e.result as EntryResult | null)?.team?.name ?? '') === s.name).length;
  const teamLabel = (s: MeetSource) => { const n = teamCount(s); return n ? `${s.name} ${String.fromCharCode(65 + n)}` : s.name; };

  const add = async () => {
    setError(null);
    try {
      let entrant: Parameters<typeof lateAddEntry>[1];
      let who: string;
      let created: { id: string; age?: string; gender?: 'M' | 'F'; house?: string } | null = null;
      if (team) {
        if (!src) { setError('Pick the team.'); return; }
        if (members.length < need) { setError(`Pick the ${need} ${boat ? 'crew members' : 'team members'}${boat?.cox ? ' (the cox last)' : ''}.`); return; }
        who = teamLabel(src);
        entrant = { name: who, team: { id: src.teamId, name: src.name, colorHex: src.colorHex }, members: members.map((id) => ({ playerId: id, name: athletes.find((a) => a.id === id)?.name ?? 'Athlete' })), bib: bib.trim() || undefined };
      } else if (fresh) {
        const name = nName.trim().replace(/\s+/g, ' ');
        if (!name) { setError('Type the name.'); return; }
        const dob = nDob.trim() ? readDob(nDob, new Date(), region.dateOrder) : undefined;
        const ageTyped = /^u\d{1,2}$|^open$/i.test(nDob.trim()) ? nDob.trim().toUpperCase().replace('OPEN', 'Open') : undefined;
        if (nDob.trim() && !dob && !ageTyped) { setError(`Date of birth as ${dateOrderWords(region.dateOrder)} (e.g. ${exampleDate(region.dateOrder)}), or an age group (U14).`); return; }
        const house = nHouse?.name ?? (nHouseText.trim() || undefined);
        who = name;
        const ok0 = await askConfirm({ title: `Add ${name} as a new ${words.replace(/s$/, '')}?`, message: `${name} isn't on any team roster — they're added for this meet only (event-only).${dob ? ` Born ${dob} (${yearsOn(dob)}).` : ''}`, yesLabel: 'Yes, create', noLabel: 'No, go back', tone: 'caution' });
        if (!ok0) return;
        setBusy(true);
        const p = await createEventAthlete({ fullName: name, gender: nGender, dob, houseName: house, houseColor: nHouse?.colorHex }, sport);
        created = { id: p.id, age: ageTyped, gender: nGender, house };
        entrant = { playerId: p.id, name, team: nHouse ? { id: nHouse.teamId, name: nHouse.name, colorHex: nHouse.colorHex } : house ? { name: house } : undefined, bib: bib.trim() || undefined };
      } else {
        if (!pick) { setError(`Pick the ${words.replace(/s$/, '')}.`); return; }
        who = pick.name;
        entrant = { playerId: pick.id, name: pick.name, team: pick.team, bib: bib.trim() || pick.bib || doc.athletes?.[pick.id]?.bib };
      }
      if (!created) {
        const ok = await askConfirm({ title: `Add ${who} to ${f.eventTitle ?? def.label}?`, message: `Late entry: ${who} goes into ${where || 'the start list'}. Everyone else keeps their ${def.lanes && def.capture === 'single' ? 'lane' : 'place'}.`, yesLabel: 'Yes, add late entry', noLabel: 'No, cancel', tone: 'caution' });
        if (!ok) return;
      }
      setBusy(true);
      const r = await lateAddEntry(phase.id, entrant, { heat });
      if (created && phase.tournamentId) {
        const c = created;
        await updateEntriesDoc(phase.tournamentId, sport, (d) => ({ ...d, athletes: { ...(d.athletes ?? {}), [c.id]: { eventOnly: true, ...(bib.trim() ? { bib: bib.trim() } : {}), ...(c.age ? { age: c.age } : {}), ...(c.gender ? { gender: c.gender } : {}), ...(c.house ? { house: c.house } : {}) } } })).catch(() => {});
      }
      await onDone(`${who} added${r.place.newHeat ? ` in a new heat ${r.place.heat}` : f.heats > 1 ? ` to heat ${r.place.heat}` : ''}${r.place.lane != null ? `, lane ${r.place.lane}` : ''}.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const lanes = def.lanes && def.capture === 'single';
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {team ? (
        <>
          <Text style={st.label}>Team</Text>
          <View style={st.wrap}>{sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={src?.key === s.key} onPress={() => { setSrc(s); setMembers([]); }} />)}</View>
          {sources.length === 0 ? <Text style={textStyles.muted}>No teams or houses in this meet yet.</Text> : null}
          {src ? (
            <>
              <Text style={st.label}>{teamLabel(src)} — {boat ? `crew (${need}${boat.cox ? ', cox last' : ''})` : `members (${need}, up to 2 reserves)`}</Text>
              <View style={st.wrap}>
                {src.playerIds.map((id) => athletes.find((a) => a.id === id)).filter((a): a is MeetAthlete => !!a).map((a) => {
                  const i = members.indexOf(a.id);
                  return <SelectChip key={a.id} label={i >= 0 ? `${i + 1}. ${a.name}` : a.name} active={i >= 0} onPress={() => setMembers((m) => (m.includes(a.id) ? m.filter((x) => x !== a.id) : m.length >= need + (boat ? 0 : 2) ? m : [...m, a.id]))} />;
                })}
              </View>
            </>
          ) : null}
        </>
      ) : (
        <>
          <View style={st.wrap}>
            <SelectChip label={`From the meet's ${words}`} active={!fresh} onPress={() => setFresh(false)} />
            <SelectChip label="＋ New (not on a team)" active={fresh} onPress={() => setFresh(true)} />
          </View>
          {!fresh ? (
            <>
              <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search athletes" />
              <SelectChip label={`Only eligible for ${categoryLabel(f.category)}`} active={eligibleOnly} onPress={() => setEligibleOnly((v) => !v)} />
              <View style={{ gap: 4 }}>
                {pool.map((a) => (
                  <TouchableOpacity key={a.id} accessibilityRole="button" accessibilityState={{ selected: pick?.id === a.id }} aria-pressed={pick?.id === a.id} onPress={() => setPick(a)} style={[st.row, pick?.id === a.id && st.rowOn]}>
                    <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{a.name}{a.team ? <Text style={textStyles.muted}>  {a.team.name}</Text> : null}</Text>
                    {a.eventOnly ? <Text style={st.tag}>event-only</Text> : null}
                  </TouchableOpacity>
                ))}
                {pool.length === 0 ? <Text style={textStyles.muted}>Nobody matches — add them as new.</Text> : null}
              </View>
            </>
          ) : (
            <>
              <TextInput style={st.input} value={nName} onChangeText={setNName} placeholder="Full name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Full name" autoCapitalize="words" />
              <View style={st.wrap}>
                <SelectChip label="Boy / Man" active={nGender === 'M'} onPress={() => setNGender('M')} />
                <SelectChip label="Girl / Woman" active={nGender === 'F'} onPress={() => setNGender('F')} />
              </View>
              <TextInput style={st.input} value={nDob} onChangeText={setNDob} placeholder={`Date of birth (${exampleDate(region.dateOrder)}) or age group (U14)`} placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Date of birth or age group" />
              <Text style={st.label}>House / team</Text>
              <View style={st.wrap}>{sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={nHouse?.key === s.key} onPress={() => setNHouse(nHouse?.key === s.key ? null : s)} />)}</View>
              {!nHouse ? <TextInput style={st.input} value={nHouseText} onChangeText={setNHouseText} placeholder="…or type a school / house" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="School or house" /> : null}
            </>
          )}
        </>
      )}
      <TextInput style={st.input} value={bib} onChangeText={setBib} placeholder="Bib (optional)" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Bib number" />
      {(heats.length > 1 || lanes) && (
        <>
          <Text style={st.label}>{lanes ? 'Heat' : 'Flight / group'}</Text>
          <View style={st.wrap}>
            <SelectChip label="Auto" active={heat === undefined} onPress={() => setHeat(undefined)} />
            {heats.length > 1 && heats.map((h) => <SelectChip key={h} label={`${h}`} active={heat === h} onPress={() => setHeat(h)} />)}
            {lanes || heats.length > 1 ? <SelectChip label="New heat" active={heat === 'new'} onPress={() => setHeat('new')} /> : null}
          </View>
        </>
      )}
      <Text style={textStyles.muted}>Goes into {where || 'the start list'}.{place.newHeat ? ' A new heat gets its own qualifying places (top N per heat).' : ''}</Text>
      <FormError message={error} />
      <Button label={busy ? 'Adding…' : 'Add late entry'} onPress={() => void add()} disabled={busy} />
    </View>
  );
}

/* --------------------------------- scratch --------------------------------- */

function ScratchList({ phase, entries, nameOf, onChanged }: { phase: FieldEvent; entries: FieldEntry[]; nameOf: (id: string) => string; onChanged: (msg: string) => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rows = entries.map((e) => ({ result: (e.result ?? {}) as EntryResult }));
  const nameOfEntry = (e: FieldEntry) => (e.playerId ? nameOf(e.playerId) : ((e.result as EntryResult | null)?.name ?? 'Team'));
  const sorted = [...entries].sort((a, b) => a.groupNo - b.groupNo || (((a.result as EntryResult | null)?.lane ?? (a.result as EntryResult | null)?.order ?? 0) - ((b.result as EntryResult | null)?.lane ?? (b.result as EntryResult | null)?.order ?? 0)));
  const heats = new Set(entries.map((e) => e.groupNo)).size;

  const doScratch = async (e: FieldEntry) => {
    setError(null);
    const why = reason === 'Other' ? other.trim() : reason;
    if (!why) { setError('Pick a reason.'); return; }
    const who = nameOfEntry(e);
    try {
      if (why === 'Wrong entry') {
        const ok = await askConfirm({ title: `Take ${who} off the start list?`, message: `A wrong entry is removed altogether (not listed as DNS). Their ${(e.result as EntryResult | null)?.lane != null ? 'lane' : 'place'} is left empty.`, yesLabel: 'Yes, remove', noLabel: 'No, keep', tone: 'danger' });
        if (!ok) return;
        await removeEntry(phase.id, e.id);
        setOpen(null);
        await onChanged(`${who} removed from the start list.`);
        return;
      }
      const ok = await askConfirm({ title: `Scratch ${who}?`, message: `Listed as DNS (${why}). Their ${(e.result as EntryResult | null)?.lane != null ? 'lane stays empty' : 'place is skipped'} and they can't go on to a later round. You can reinstate them until this round is closed.`, yesLabel: 'Yes, scratch', noLabel: 'No, keep them', tone: 'danger' });
      if (!ok) return;
      await scratchEntry(phase.id, e.id, why);
      setOpen(null); setReason(''); setOther('');
      await onChanged(`${who} scratched (${why}).`);
    } catch (err) { setError((err as Error).message); }
  };
  const doReinstate = async (e: FieldEntry) => {
    setError(null);
    const who = nameOfEntry(e);
    const ok = await askConfirm({ title: `Reinstate ${who}?`, message: 'Back on the start list in the same heat and lane.', yesLabel: 'Yes, reinstate', noLabel: 'No, leave scratched', tone: 'caution' });
    if (!ok) return;
    try { await reinstateEntry(phase.id, e.id); await onChanged(`${who} is back on the start list.`); } catch (err) { setError((err as Error).message); }
  };

  return (
    <View style={{ gap: 4 }}>
      <FormError message={error} />
      {sorted.map((e) => {
        const r = (e.result ?? {}) as EntryResult;
        const v = scratchVerdict(phase.status, r, rows);
        const pos = `${heats > 1 ? `H${e.groupNo} ` : ''}${r.lane != null ? `L${r.lane}` : r.order != null ? `#${r.order}` : ''}`;
        return (
          <View key={e.id} style={{ gap: 6 }}>
            <View style={st.row}>
              <Text style={st.pos}>{pos}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[textStyles.body, isScratched(r) && st.struck]} numberOfLines={1}>{nameOfEntry(e)}{r.late ? <Text style={st.tag}>  late</Text> : null}</Text>
                {isScratched(r) ? <Text style={textStyles.muted} numberOfLines={1}>Scratched — {r.scratch!.reason}</Text> : !v.ok ? <Text style={textStyles.muted} numberOfLines={1}>{v.reason}</Text> : null}
              </View>
              {isScratched(r)
                ? phase.status !== 'completed' && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reinstate ${nameOfEntry(e)}`} onPress={() => void doReinstate(e)} style={st.small}><Text style={st.smallTxt}>Reinstate</Text></TouchableOpacity>
                : v.ok && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Scratch ${nameOfEntry(e)}…`} onPress={() => { setOpen(open === e.id ? null : e.id); setReason(''); }} style={[st.small, st.smallDanger]}><Text style={st.smallTxt}>Scratch</Text></TouchableOpacity>}
            </View>
            {open === e.id && (
              <View style={st.reasons}>
                <Text style={st.label}>Reason</Text>
                <View style={st.wrap}>{[...SCRATCH_REASONS, 'Other'].map((x) => <SelectChip key={x} label={x} active={reason === x} onPress={() => setReason(x)} />)}</View>
                {reason === 'Other' ? <TextInput style={st.input} value={other} onChangeText={setOther} placeholder="Reason" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Scratch reason" /> : null}
                <Button label={reason === 'Wrong entry' ? `Remove ${nameOfEntry(e)}` : `Scratch ${nameOfEntry(e)}`} variant="danger" onPress={() => void doScratch(e)} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  info: { color: theme.colors.primary, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing(3), minHeight: 44, color: theme.colors.text, backgroundColor: theme.colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), minHeight: 44, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  rowOn: { borderColor: theme.colors.primary, borderWidth: 2 },
  tag: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  pos: { width: 48, color: theme.colors.textMuted, fontWeight: '800', fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  small: { minHeight: 36, justifyContent: 'center', paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  smallDanger: { borderColor: theme.colors.danger },
  smallTxt: { color: theme.colors.text, fontWeight: '700' },
  reasons: { gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
});
