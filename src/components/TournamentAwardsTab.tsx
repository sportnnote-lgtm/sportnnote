/** The tournament's Awards tab (parity #21). Hosts get the slots pre-filled
 *  from the stats ("Auto-suggested" until touched), change any via the ranked
 *  AwardPickerSheet, add custom awards and publish (winners notified). Everyone
 *  else sees the award cards once published. Rendered in place of the profile's
 *  scroll area so the Publish button can sit in a sticky footer. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, Pill, SelectChip, TextField, textStyles } from './ui';
import { AwardPickerSheet, type PickerRow } from './AwardPickerSheet';
import { getSport } from '../sports/registry';
import { confirmAction, notice } from '../core/confirm';
import { notify } from '../core/notifications';
import { shareMessage } from '../core/share';
import { awardsShareText } from '../core/shareText';
import { saveTournamentAwards, logActivity, AWARDS_DB_MESSAGE } from '../data/repos';
import {
  TOURNAMENT_AWARD_SLOTS, rankAwardCandidates, defaultAwards, awardFrom, awardId, awardIcon, awardFormula, type AwardCandidate,
} from '../data/ratings';
import type { Match, Player, SportId, StatLine, Tournament, TournamentAward, TournamentAwards } from '../core/types';
import { readLeaderMins, type LeaderMins } from '../data/leaderMinimums';
import { LeaderSplitChips, useLeaderSplits } from './LeaderSplitChips';

const CUSTOM_SUGGESTIONS = ['Best fielder', 'Emerging player', 'Fair play', 'Best goalkeeper'];

const initials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

type Picker =
  | { kind: 'slot'; sport: SportId; slot: string; label: string }
  | { kind: 'custom'; sport: SportId; label: string; id: string };

export function TournamentAwardsTab({
  tournament, matches, lines, players, canManage, myId, myName, activeSport, onSport, awards, onSaved, onPlayer, savedMins,
}: {
  tournament: Tournament;
  matches: Match[];
  /** SD-27 — minimums saved from the Stats tab this session (else the format's) */
  savedMins?: Partial<Record<SportId, LeaderMins>>;
  lines: StatLine[];
  players: Player[];
  canManage: boolean;
  myId?: string | null;
  myName?: string;
  activeSport?: SportId;
  onSport: (s: SportId) => void;
  awards?: TournamentAwards;
  onSaved: (a: TournamentAwards) => void;
  onPlayer: (playerId: string) => void;
}) {
  const sports = tournament.sports;
  const sport = activeSport ?? sports[0];
  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);
  const published = !!awards?.publishedAt;
  // SD-27: every ranking uses the matches (W / L) and the organiser's minimums
  const optsFor = useMemo(() => {
    const cache = new Map<SportId, { matchIds: Set<string>; matches: Match[]; mins: LeaderMins }>();
    return (sp: SportId) => {
      if (!cache.has(sp)) cache.set(sp, { matchIds, matches, mins: savedMins?.[sp] ?? readLeaderMins(tournament.formats?.[sp] as Record<string, unknown> | undefined) });
      return cache.get(sp)!;
    };
  }, [matchIds, matches, savedMins, tournament.formats]);

  // SD-43: the host can rank the active sport's awards on one format / ball
  // (cricket T20 / Leather…); other sports' lines pass through. Published
  // awards are never recomputed.
  const tourList = useMemo(() => [tournament], [tournament]);
  const splitScope = useLeaderSplits(sport, lines, matches, tourList);
  const rankLines = splitScope.lines;
  // a winner ranked on one format says so ("312 runs · T20 · Leather")
  const scoped = (a: TournamentAward): TournamentAward =>
    (splitScope.label && a.sport === sport ? { ...a, detail: [a.detail, splitScope.label].filter(Boolean).join(' · ') } : a);
  // Suggestions for every sport (the #1 candidate per slot).
  const suggested = useMemo(
    () => sports.flatMap((sp) => defaultAwards(rankLines, players, sp, optsFor(sp))).map(scoped),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sports, rankLines, players, optsFor, splitScope.label, sport],
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TournamentAward[] | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<Picker | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);

  const base = awards ? awards.items : suggested;
  const current = draft ?? base;
  const isAuto = (id: string) => !awards && !touched.has(id);
  const mutate = (id: string, fn: (items: TournamentAward[]) => TournamentAward[]) => {
    setDraft(fn(current));
    setTouched((t) => new Set(t).add(id));
  };

  // Players with a stat line in this sport here — custom awards go only to them.
  const candidatesMvp = useMemo(
    () => (sport ? rankAwardCandidates(rankLines, players, sport, 'mvp', Number.MAX_SAFE_INTEGER, optsFor(sport)) : []),
    [rankLines, players, sport, optsFor],
  );
  const linePlayerRows = useMemo((): PickerRow[] => {
    if (!sport) return [];
    const byId = new Map(players.map((p) => [p.id, p] as const));
    const mvpBy = new Map(candidatesMvp.map((c) => [c.playerId, c] as const));
    const games = new Map<string, number>();
    for (const l of rankLines) if (l.sport === sport && matchIds.has(l.matchId)) games.set(l.playerId, (games.get(l.playerId) ?? 0) + 1);
    return [...games.entries()].map(([pid, g]) => {
      const p = byId.get(pid);
      return { id: pid, name: p?.fullName ?? 'Player', teamName: p?.houseName, teamColor: p?.houseColor, detail: mvpBy.get(pid)?.detail ?? `${g} m` };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [sport, players, rankLines, matchIds, candidatesMvp]);

  const toRow = (c: AwardCandidate): PickerRow => ({ id: c.playerId, name: c.name, teamName: c.teamName, teamColor: c.teamColor, detail: c.detail, value: c.display ?? c.value });
  const pickerRows = useMemo((): PickerRow[] => {
    if (!picker) return [];
    if (picker.kind === 'custom') return linePlayerRows;
    return rankAwardCandidates(rankLines, players, picker.sport, picker.slot, 10, optsFor(picker.sport)).map(toRow);
  }, [picker, rankLines, players, optsFor, linePlayerRows]);

  const onPick = (row: PickerRow) => {
    if (!picker) return;
    if (picker.kind === 'slot') {
      const c = rankAwardCandidates(rankLines, players, picker.sport, picker.slot, Number.MAX_SAFE_INTEGER, optsFor(picker.sport)).find((x) => x.playerId === row.id);
      if (c) {
        const id = awardId(picker.sport, picker.slot);
        const next = scoped(awardFrom(picker.sport, picker.slot, picker.label, c));
        mutate(id, (items) => (items.some((i) => i.id === id) ? items.map((i) => (i.id === id ? next : i)) : [...items, next]));
      }
    } else {
      const next: TournamentAward = {
        id: picker.id, slot: 'custom', label: picker.label, sport: picker.sport,
        playerId: row.id, playerName: row.name, teamName: row.teamName, detail: row.detail,
      };
      mutate(picker.id, (items) => (items.some((i) => i.id === picker.id) ? items.map((i) => (i.id === picker.id ? next : i)) : [...items, next]));
      setCustomOpen(false);
      setCustomName('');
    }
    setPicker(null);
  };
  const clear = (id: string) => mutate(id, (items) => items.filter((i) => i.id !== id));

  const publish = async () => {
    const items = current.filter((i) => i.playerId && i.label.trim());
    if (items.length === 0) { notice('Nothing to publish', 'Pick at least one winner first.'); return; }
    const ok = await confirmAction(published ? 'Update awards?' : 'Publish awards?', 'Winners will be notified. You can edit later.', published ? 'Update' : 'Publish');
    if (!ok) return;
    const next: TournamentAwards = { publishedAt: awards?.publishedAt ?? new Date().toISOString(), items };
    setSaving(true);
    try {
      await saveTournamentAwards(tournament.id, next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Please try again.';
      notice(msg === AWARDS_DB_MESSAGE ? 'Needs a database update' : 'Couldn’t save awards', msg);
      return;
    } finally {
      setSaving(false);
    }
    void logActivity({
      scope: 'tournament', refId: tournament.id, action: 'awards_published',
      detail: `${items.length} award${items.length === 1 ? '' : 's'}`, byPlayerId: myId ?? undefined, byName: myName,
    });
    // Notify new or changed winners only (not on every re-publish).
    const before = new Map((awards?.publishedAt ? awards.items : []).map((i) => [i.id, i.playerId] as const));
    for (const i of items) {
      if (before.get(i.id) !== i.playerId) void notify({ playerId: i.playerId, title: `🏆 You won ${i.label}`, body: tournament.name });
    }
    onSaved(next);
    setDraft(null);
    setTouched(new Set());
    setEditing(false);
  };

  const share = () => {
    const items = awards?.items ?? [];
    void shareMessage(awardsShareText({
      tournament: tournament.name, tournamentId: tournament.id,
      awards: items.map((i) => ({ icon: awardIcon(i.sport, i.slot), label: sports.length > 1 ? `${i.label} (${getSport(i.sport).name})` : i.label, playerName: i.playerName, teamName: i.teamName, detail: i.detail })),
    }), 'tournament');
  };

  const sportRow = sports.length > 1 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
      {sports.map((s) => <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={sport === s} onPress={() => onSport(s)} />)}
    </ScrollView>
  ) : null;

  const colorOf = (pid: string) => players.find((p) => p.id === pid)?.houseColor ?? theme.colors.surfaceAlt;

  // ------------------------------ Published view ------------------------------
  if (!canManage || (published && !editing)) {
    const items = (awards?.publishedAt ? awards.items : []).filter((i) => i.sport === sport);
    return (
      <ScrollView contentContainerStyle={st.content}>
        {sportRow}
        {items.length === 0 ? (
          <EmptyState icon="🏆" title="Awards" hint={published ? 'No awards in this sport.' : 'Awards appear here once the organiser publishes them.'} />
        ) : items.map((i) => (
          <TouchableOpacity key={i.id} accessibilityRole="button" accessibilityLabel={`${i.label}: ${i.playerName}`} activeOpacity={0.85} onPress={() => onPlayer(i.playerId)}>
            <Card style={st.awardCard}>
              <View style={[st.avatar, { backgroundColor: colorOf(i.playerId) }]}>
                <Text style={st.avatarText}>{initials(i.playerName)}</Text>
                <Text style={st.badge}>{awardIcon(i.sport, i.slot)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.label} numberOfLines={1}>{i.label}</Text>
                <Text style={st.name} numberOfLines={1}>{i.playerName}</Text>
                <Text style={st.detail} numberOfLines={2}>{[i.teamName, i.detail].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={st.chevron}>›</Text>
            </Card>
          </TouchableOpacity>
        ))}
        {published ? <Button label="📤 Share awards" variant="ghost" onPress={share} /> : null}
        {canManage && published ? <Button label="✏️ Edit awards" variant="ghost" onPress={() => setEditing(true)} /> : null}
      </ScrollView>
    );
  }

  // -------------------------------- Host draft --------------------------------
  const slots = sport ? TOURNAMENT_AWARD_SLOTS[sport] ?? [] : [];
  const customs = current.filter((i) => i.slot === 'custom' && i.sport === sport);
  const hasPlayers = linePlayerRows.length > 0;
  const sportItems = current.filter((i) => i.sport === sport);

  const slotCard = (key: string, label: string, icon: string, item: TournamentAward | undefined, onChange: (() => void) | undefined) => (
    <Card key={key} style={{ gap: theme.spacing(2) }}>
      <View style={st.slotHead}>
        <Text style={st.label} numberOfLines={2}>{icon} {label}</Text>
        {item && isAuto(item.id) ? <Pill label="Auto-suggested" color={theme.colors.primary + '22'} textColor={theme.colors.primary} /> : null}
      </View>
      {item ? (
        <View style={st.awardCardRow}>
          <View style={[st.avatar, { backgroundColor: colorOf(item.playerId) }]}>
            <Text style={st.avatarText}>{initials(item.playerName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={1}>{item.playerName}</Text>
            <Text style={st.detail} numberOfLines={2}>{[item.teamName, item.detail].filter(Boolean).join(' · ')}</Text>
          </View>
          {onChange ? <Text style={st.link} accessibilityRole="button" accessibilityLabel={`Change ${label}`} onPress={onChange}>Change</Text> : null}
          <Text style={st.clear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => clear(item.id)}>✕</Text>
        </View>
      ) : (
        <View style={st.awardCardRow}>
          <Text style={[textStyles.muted, { flex: 1 }]}>{onChange ? 'No winner picked.' : 'No stats for this yet.'}</Text>
          {onChange ? <Text style={st.link} accessibilityRole="button" accessibilityLabel={`Pick ${label}`} onPress={onChange}>Pick</Text> : null}
        </View>
      )}
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {sportRow}
        <LeaderSplitChips scope={splitScope} note="Suggestions and rankings use" />
        {!hasPlayers && sportItems.length === 0 ? (
          <EmptyState icon="🏆" title="Awards" hint="Suggestions appear once matches have player stats." />
        ) : (
          <>
            <Text style={textStyles.muted}>{published ? 'Edit the awards, then tap Update.' : 'Pre-filled from the stats — change any, then publish.'}</Text>
            {slots.map((s) => {
              const has = sport ? rankAwardCandidates(rankLines, players, sport, s.slot, 1, optsFor(sport)).length > 0 : false;
              return slotCard(s.slot, s.label, s.icon, current.find((i) => i.id === awardId(sport!, s.slot)),
                has ? () => setPicker({ kind: 'slot', sport: sport!, slot: s.slot, label: s.label }) : undefined);
            })}
            {customs.map((c) => slotCard(c.id, c.label, '🏅', c, () => setPicker({ kind: 'custom', sport: sport!, label: c.label, id: c.id })))}
            {customOpen ? (
              <Card style={{ gap: theme.spacing(2) }}>
                <TextField label="Award name" value={customName} onChange={setCustomName} placeholder="e.g. Best fielder" autoCapitalize="words" />
                <View style={st.chipsWrap}>
                  {CUSTOM_SUGGESTIONS.map((n) => <SelectChip key={n} label={n} active={customName === n} onPress={() => setCustomName(n)} />)}
                </View>
                <View style={st.row2}>
                  <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => { setCustomOpen(false); setCustomName(''); }} />
                  <Button
                    label="Choose player" style={{ flex: 1 }} disabled={!customName.trim() || !hasPlayers}
                    onPress={() => setPicker({ kind: 'custom', sport: sport!, label: customName.trim(), id: `custom-${Date.now().toString(36)}` })}
                  />
                </View>
              </Card>
            ) : (
              <Button label="＋ Custom award" variant="ghost" disabled={!hasPlayers} onPress={() => setCustomOpen(true)} />
            )}
          </>
        )}
      </ScrollView>
      {current.length > 0 || published ? (
        <View style={st.footer}>
          {published ? <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => { setDraft(null); setTouched(new Set()); setEditing(false); }} /> : null}
          <Button label={saving ? 'Saving…' : published ? 'Update awards' : 'Publish awards'} disabled={saving} style={{ flex: 2 }} onPress={() => void publish()} />
        </View>
      ) : null}
      <AwardPickerSheet
        visible={!!picker} onClose={() => setPicker(null)}
        title={picker ? `${picker.kind === 'slot' ? awardIcon(picker.sport, picker.slot) : '🏅'} ${picker.label}` : ''}
        subtitle={picker?.kind === 'custom' ? 'Players with stats in this tournament' : undefined}
        howRanked={picker?.kind === 'slot' ? awardFormula(picker.sport, picker.slot, optsFor(picker.sport).mins) : undefined}
        rows={pickerRows} ranked={picker?.kind === 'slot'} searchable={picker?.kind === 'custom'}
        selectedId={picker ? current.find((i) => i.id === (picker.kind === 'slot' ? awardId(picker.sport, picker.slot) : picker.id))?.playerId : undefined}
        emptyLabel="No player stats yet."
        onPick={onPick}
      />
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(8) },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row2: { flexDirection: 'row', gap: theme.spacing(2) },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  awardCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  awardCardRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '900' },
  badge: { position: 'absolute', bottom: -5, right: -5, fontSize: 15 },
  label: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 1 },
  link: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small, paddingHorizontal: theme.spacing(1) },
  clear: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.body, paddingHorizontal: theme.spacing(1) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  footer: {
    flexDirection: 'row', gap: theme.spacing(2), paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(3),
    borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bg,
  },
});
