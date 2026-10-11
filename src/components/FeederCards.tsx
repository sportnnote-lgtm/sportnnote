/** SD-154 — feeder tournaments on screen.
 *  - QualifiesToCard (the FEEDER's settings): "Top 2 of each group go through to
 *    National Finals" — pick the receiving tournament, how many, per group or
 *    overall.
 *  - QualifiersCard (the RECEIVING tournament's entries): each feeder's
 *    qualifiers so far, with one tap to add them all (they show "Qualified from
 *    County Cup").
 *  - useFeeders: the feeders of a tournament (for the badge). */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, SelectChip, TextField, textStyles } from './ui';
import { getFeedersInto, getMatches, getTournaments, setQualifiesTo, addQualifiedTeams, isNeedsDbUpdate } from '../data/repos';
import { feederQualifiers, qualifiesLine, type FeederQualifier } from '../data/feeders';
import { standingsConfigFromFormat } from '../data/standings';
import { notice } from '../core/confirm';
import type { Match, SportId, Tournament, TournamentEntry } from '../core/types';

/** The tournaments that feed into this one (refetches on `tick`). */
export function useFeeders(tournamentId?: string, tick = 0): Tournament[] {
  const [list, setList] = useState<Tournament[]>([]);
  useEffect(() => {
    let on = true;
    if (!tournamentId) { setList([]); return; }
    void getFeedersInto(tournamentId).then((l) => on && setList(l)).catch(() => on && setList([]));
    return () => { on = false; };
  }, [tournamentId, tick]);
  return list;
}

/** The feeder's own setting: where its top finishers go. */
export function QualifiesToCard({ tournament, onSaved }: { tournament: Tournament; onSaved?: () => void }) {
  const [link, setLink] = useState(tournament.qualifiesTo);
  useEffect(() => { setLink(tournament.qualifiesTo); }, [tournament.qualifiesTo?.tournamentId, tournament.qualifiesTo?.topN, tournament.qualifiesTo?.per]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Tournament[]>([]);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<{ id: string; name: string } | null>(link ? { id: link.tournamentId, name: link.tournamentName ?? 'the next round' } : null);
  const [topN, setTopN] = useState(link?.topN ?? 2);
  const [per, setPer] = useState<'group' | 'overall'>(link?.per ?? 'group');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && !all.length) void getTournaments().then(setAll).catch(() => {}); }, [open, all.length]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((t) => t.id !== tournament.id && (!s || t.name.toLowerCase().includes(s) || (t.city ?? '').toLowerCase().includes(s))).slice(0, 6);
  }, [all, q, tournament.id]);

  async function save(clear = false) {
    setBusy(true);
    try {
      const next = clear || !target ? null : { tournamentId: target.id, tournamentName: target.name, topN, per };
      await setQualifiesTo(tournament.id, next);
      setLink(next ?? undefined);
      setOpen(false);
      onSaved?.();
    } catch (e) {
      notice('Couldn’t save', isNeedsDbUpdate(e) ? 'Feeder tournaments need the latest database update.' : e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <Card style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.h3}>🎟 Qualifies to another tournament</Text>
        <Text style={textStyles.muted}>{link ? `${qualifiesLine(link)}.` : 'Off — use this for a county, zonal or conference round whose top teams go on to the next round (national finals, state playoffs).'}</Text>
        <Button label={link ? 'Change' : 'Set up'} variant="ghost" onPress={() => setOpen(true)} />
      </Card>
    );
  }
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>🎟 Qualifies to</Text>
      {target ? <Text style={textStyles.body}>→ {target.name}</Text> : null}
      <TextField label="Find the next-round tournament" value={q} onChange={setQ} placeholder="National Finals" autoCapitalize="words" />
      <View style={st.chips}>
        {matches.map((t) => <SelectChip key={t.id} label={t.name} active={target?.id === t.id} onPress={() => setTarget({ id: t.id, name: t.name })} />)}
      </View>
      {!matches.length ? <Text style={textStyles.muted}>Create the next-round tournament first, then link it here.</Text> : null}
      <Text style={textStyles.muted}>Who goes through</Text>
      <View style={st.chips}>
        <SelectChip label="Top of each group" active={per === 'group'} onPress={() => setPer('group')} />
        <SelectChip label="Top overall / final places" active={per === 'overall'} onPress={() => setPer('overall')} />
      </View>
      <View style={st.chips}>
        {[1, 2, 3, 4, 8].map((n) => <SelectChip key={n} label={`Top ${n}`} active={topN === n} onPress={() => setTopN(n)} />)}
      </View>
      <View style={st.chips}>
        <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !target} onPress={() => void save()} />
        {link ? <Button label="Remove link" variant="ghost" disabled={busy} onPress={() => void save(true)} /> : null}
        <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}

/** The receiving tournament: each feeder's qualifiers, added in one tap. */
export function QualifiersCard({ tournamentId, sport, entries, feeders, onAdded }: {
  tournamentId: string; sport: SportId; entries: TournamentEntry[]; feeders: Tournament[]; onAdded: () => void;
}) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (!feeders.length) return;
    void getMatches(sport).then((m) => on && setMatches(m)).catch(() => on && setMatches([]));
    return () => { on = false; };
  }, [sport, feeders.length]);
  const relevant = feeders.filter((f) => f.qualifiesTo && (!f.qualifiesTo.sport || f.qualifiesTo.sport === sport) && f.sports.includes(sport));
  if (!relevant.length) return null;
  const inIds = new Set(entries.filter((e) => e.status === 'confirmed' || e.status === 'invited').map((e) => e.team.id));
  return (
    <Card style={{ gap: theme.spacing(3) }}>
      <Text style={textStyles.h3}>🎟 Qualifiers</Text>
      {relevant.map((f) => {
        const link = f.qualifiesTo!;
        const res = matches ? feederQualifiers(matches.filter((m) => m.tournamentId === f.id), sport, link, standingsConfigFromFormat(sport, f.formats?.[sport] as Record<string, unknown> | undefined)) : null;
        const todo = (res?.qualifiers ?? []).filter((x) => !inIds.has(x.teamId));
        const add = async (list: FeederQualifier[]) => {
          setBusy(f.id);
          try { await addQualifiedTeams(tournamentId, list.map((x) => x.teamId), f.id); onAdded(); }
          catch (e) { notice('Couldn’t add the qualifiers', e instanceof Error ? e.message : 'Please try again.'); }
          finally { setBusy(null); }
        };
        return (
          <View key={f.id} style={{ gap: theme.spacing(1) }}>
            <Text style={[textStyles.body, st.bold]}>From {f.name}</Text>
            <Text style={textStyles.muted}>{link.per === 'group' ? `Top ${link.topN} of each group` : link.topN === 1 ? 'The winner' : `The top ${link.topN}`}{res?.provisional ? ' · not final yet — tables can still change' : ''}</Text>
            {!res ? <Text style={textStyles.muted}>Loading…</Text> : !res.qualifiers.length ? <Text style={textStyles.muted}>No results there yet.</Text> : res.qualifiers.map((x) => (
              <Text key={x.teamId} style={textStyles.muted} numberOfLines={1}>{inIds.has(x.teamId) ? '✓ ' : '• '}{x.name} — {x.how}</Text>
            ))}
            {todo.length ? (
              <Button label={busy === f.id ? 'Adding…' : `＋ Add ${todo.length} qualifier${todo.length === 1 ? '' : 's'}`} disabled={!!busy} onPress={() => void add(todo)} />
            ) : res?.qualifiers.length ? <Text style={textStyles.muted}>All in ✓</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}

/** "🎟 Qualified from County Cup" for an entry, or null. */
export function qualifiedBadge(e: TournamentEntry, feeders: Tournament[]): string | null {
  if (!e.qualifiedFrom) return null;
  const f = feeders.find((x) => x.id === e.qualifiedFrom);
  return `🎟 Qualified from ${f?.name ?? 'a qualifying round'}`;
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5) },
  bold: { fontWeight: '700' },
});
