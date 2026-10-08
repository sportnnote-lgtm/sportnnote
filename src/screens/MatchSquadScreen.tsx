/** Pick the matchday squad for one team: the starting XI (capped at the format's
 *  players-a-side) and the substitutes, chosen from the team's full saved squad.
 *  This is the simple who's-playing picker for every sport — tap Start / Bench,
 *  watch the counter. For sports with a pitch/court, saving also auto-places the
 *  chosen starters into a positional lineup (so the Lineups tab & clean-sheet
 *  logic work without touching the pitch); an optional "Arrange on pitch" hand-off
 *  lets you fine-tune positions afterwards. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Button, ScreenTitle, textStyles, plural } from '../components/ui';
import { getSport } from '../sports/registry';
import { getRoster, getMatchSquads, setMatchSquad, getLineup, setLineup, getLastSquadForTeam, removePlayerFromTeam } from '../data/repos';
import { AddInvitePlayer } from '../components/AddInvitePlayer';
import { matchEligibility, canFieldPlayer, TESTING_ALLOW_UNVERIFIED } from '../core/eligibility';
import type { LineupSlot, MatchLineup, Player } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Role = 'start' | 'sub' | 'out';

/** Merge a chosen set of starters into a side's positional slots without losing
 *  hand-placed positions: keep placed players who are still starting, drop those
 *  no longer starting, then fill the empty slots (in order) with the rest. */
function reconcilePositions(
  starters: string[],
  existing: LineupSlot[],
  fresh: LineupSlot[],
  nameOf: (id: string) => string | undefined,
): LineupSlot[] {
  const base = existing.length ? existing : fresh;
  const slots = base.map((s) => ({ ...s }));
  for (const s of slots) {
    if (s.playerId && !starters.includes(s.playerId)) { s.playerId = undefined; s.playerName = undefined; }
  }
  const placed = new Set(slots.map((s) => s.playerId).filter(Boolean) as string[]);
  const queue = starters.filter((id) => !placed.has(id));
  let qi = 0;
  for (const s of slots) {
    if (!s.playerId && qi < queue.length) { const id = queue[qi++]; s.playerId = id; s.playerName = nameOf(id); }
  }
  return slots;
}

export default function MatchSquadScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'MatchSquad'>>();
  const { matchId, side, teamName, sport, playersPerSide = 11, teamId, homeTeamName, awayTeamName, homeColor, awayColor, editableSides } = params;
  const plugin = getSport(sport);
  const hasPitch = !!plugin.Court; // football + the court sports can arrange positions

  const [roster, setRoster] = useState<Player[]>([]);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  // Friendlies often share one pool of players between both teams; on the day each
  // person plays for ONE side. Players already in the other side's matchday squad
  // can't be picked here.
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const otherSide = side === 'home' ? 'away' : 'home';
  const otherName = (side === 'home' ? awayTeamName : homeTeamName) ?? 'the other team';
  const pickable = (p: Player) => canFieldPlayer(p) && !taken.has(p.id);
  const [lineup, setLineupState] = useState<MatchLineup | null>(null);
  const [lastSquad, setLastSquad] = useState<{ starters: string[]; subs: string[] } | null>(null);
  const [rosterNonce, setRosterNonce] = useState(0); // bumped after adding/inviting a player
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([
        getRoster(teamName, sport), getMatchSquads(matchId), getLineup(matchId, sport, playersPerSide), getLastSquadForTeam(teamName, sport, matchId),
      ]).then(([rs, squads, lu, last]) => {
        if (!on) return;
        setRoster(rs);
        setLineupState(lu);
        setLastSquad(last);
        const sq = squads[side];
        const other = new Set([...squads[otherSide].starters, ...squads[otherSide].subs]);
        setTaken(other);
        // Preserve any picks already made this session (e.g. after adding a player).
        setRoles((prev) => {
          const next: Record<string, Role> = {};
          rs.forEach((p) => {
            next[p.id] = other.has(p.id) ? 'out' : prev[p.id] ?? (sq.starters.includes(p.id) ? 'start' : sq.subs.includes(p.id) ? 'sub' : 'out');
          });
          return next;
        });
      });
      return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId, side, teamName, sport, rosterNonce])
  );

  // The last XI is only copyable for players still in this squad and eligible.
  const lastEligibleCount = lastSquad
    ? [...lastSquad.starters, ...lastSquad.subs].filter((id) => roster.some((p) => p.id === id && pickable(p))).length
    : 0;
  const copyLastXI = () => {
    if (!lastSquad) return;
    setRoles(() => {
      const next: Record<string, Role> = {};
      roster.forEach((p) => { next[p.id] = 'out'; });
      let starts = 0;
      for (const id of lastSquad.starters) {
        const p = roster.find((x) => x.id === id);
        if (p && pickable(p) && starts < playersPerSide) { next[id] = 'start'; starts++; }
      }
      for (const id of lastSquad.subs) {
        const p = roster.find((x) => x.id === id);
        if (p && pickable(p) && next[id] !== 'start') next[id] = 'sub';
      }
      return next;
    });
  };

  const eligible = roster.filter((p) => pickable(p));
  const startCount = Object.values(roles).filter((r) => r === 'start').length;
  const subCount = Object.values(roles).filter((r) => r === 'sub').length;
  const xiFull = startCount >= playersPerSide;

  const setRole = (id: string, role: Role) =>
    setRoles((r) => {
      const p = roster.find((x) => x.id === id);
      if (p && !pickable(p)) return r; // playing for the other side, or unverified players can't be fielded (unless the testing override is on)
      if (role === 'start' && r[id] !== 'start' && startCount >= playersPerSide) return r; // XI full
      return { ...r, [id]: r[id] === role ? 'out' : role };
    });

  // Quick action: fill the XI with the first eligible players not already placed.
  const fillXI = () =>
    setRoles((r) => {
      const next = { ...r };
      let count = Object.values(next).filter((x) => x === 'start').length;
      for (const p of eligible) {
        if (count >= playersPerSide) break;
        if (next[p.id] !== 'start') { next[p.id] = 'start'; count++; }
      }
      return next;
    });
  const clearAll = () => setRoles((r) => Object.fromEntries(Object.keys(r).map((k) => [k, 'out' as Role])));

  async function persist(): Promise<{ starters: string[]; subs: string[] }> {
    // Re-check the other side right before saving (its squad may have been set
    // meanwhile on another phone) — one person never plays for both sides.
    const now = (await getMatchSquads(matchId))[otherSide];
    const busyElsewhere = new Set([...now.starters, ...now.subs]);
    setTaken(busyElsewhere);
    const starters = roster.filter((p) => roles[p.id] === 'start' && !busyElsewhere.has(p.id)).map((p) => p.id);
    const subs = roster.filter((p) => roles[p.id] === 'sub' && !busyElsewhere.has(p.id)).map((p) => p.id);
    await setMatchSquad(matchId, side, { starters, subs });
    // For pitch sports, keep a positional lineup in sync so the Lineups tab is
    // populated even if the user never opens the pitch.
    if (hasPitch && lineup) {
      const fresh = plugin.formation?.(playersPerSide) ?? [];
      const nameOf = (id: string) => roster.find((p) => p.id === id)?.fullName;
      const nextSide = reconcilePositions(starters, lineup[side], fresh, nameOf);
      const nextLineup = { ...lineup, [side]: nextSide };
      setLineupState(nextLineup);
      await setLineup(matchId, nextLineup);
    }
    return { starters, subs };
  }

  async function save() {
    setBusy(true);
    await persist();
    setBusy(false);
    nav.goBack();
  }

  async function arrangeOnPitch() {
    setBusy(true);
    await persist(); // save first so the pitch opens with these starters placed
    setBusy(false);
    nav.replace('LineupEditor', {
      matchId, sport, playersPerSide,
      homeTeamName: homeTeamName ?? teamName, awayTeamName: awayTeamName ?? teamName,
      homeColor, awayColor,
      // A captain reaching the pitch may only touch their own side — never toggle to
      // the opponent. Default to just the side they opened if no explicit set is given.
      editableSides: editableSides ?? [side],
    });
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      {/* Pinned counter — always visible while you tap through the squad. */}
      <View style={st.header}>
        <ScreenTitle title={`${teamName} — pick who plays`} subtitle="Choose your starters and subs from the saved squad" />
        {roster.length > 0 && (
          <Text style={st.savedNote}>💾 {plural(roster.length, 'player')} in {teamName}’s saved squad — kept for every match.</Text>
        )}
        <View style={st.counterRow}>
          <View style={[st.counterPill, xiFull && st.counterPillFull]}>
            <Text style={[st.counterText, xiFull && st.counterTextFull]}>Starting {startCount}/{playersPerSide}</Text>
          </View>
          <View style={st.counterPill}>
            <Text style={st.counterText}>{plural(subCount, 'sub')}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {startCount < playersPerSide && eligible.length > startCount + subCount ? (
            <Text style={st.quick} onPress={fillXI}>Fill starters</Text>
          ) : null}
          {startCount + subCount > 0 ? <Text style={st.quick} onPress={clearAll}>Clear</Text> : null}
        </View>
        {lastEligibleCount > 0 && (
          <TouchableOpacity accessibilityRole="button" style={st.copyBtn} activeOpacity={0.85} onPress={copyLastXI}>
            <Text style={st.copyText}>↻ Copy last match’s squad ({lastEligibleCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={st.content}>
        {TESTING_ALLOW_UNVERIFIED && (
          <View style={st.testBanner}>
            <Text style={st.testBannerText}>
              ⚠️ Testing mode: eligibility checks are off — unverified players can be fielded. This will be re-enabled before go-live.
            </Text>
          </View>
        )}
        {roster.length === 0 ? (
          <EmptyState icon="👥" title="No players in this team’s squad yet" hint="Add them from the match Info tab (＋ Add players to this team)." compact />
        ) : (
          roster.map((p) => {
            const role = roles[p.id] ?? 'out';
            const elig = matchEligibility(p);
            const elsewhere = taken.has(p.id);
            const canField = canFieldPlayer(p) && !elsewhere; // eligible (or testing override) and not on the other side today
            const overridden = !elig.ok && canField; // fieldable only because of the override
            const disableStart = !canField || (role !== 'start' && xiFull);
            return (
              <View key={p.id} style={[st.row, !canField && st.rowLocked, role !== 'out' && st.rowActive]}>
                <View style={{ flex: 1 }}>
                  <Text style={[textStyles.body, !canField && st.lockedName]}>
                    {p.fullName}{p.jerseyNo ? ` · #${p.jerseyNo}` : ''}{p.invited ? '  ⏳' : ''}
                  </Text>
                  {elsewhere ? (
                    <Text style={st.lockReason}>Playing for {otherName} in this match</Text>
                  ) : !elig.ok ? (
                    <Text style={overridden ? st.overrideReason : st.lockReason}>
                      {overridden ? '⚠️' : '🔒'} {elig.reason}{overridden ? ' · allowed (testing)' : ''}
                    </Text>
                  ) : null}
                </View>
                {canField ? (
                  <View style={st.toggles}>
                    <Toggle label="Start" active={role === 'start'} disabled={disableStart} color={theme.colors.primary} onPress={() => setRole(p.id, 'start')} />
                    <Toggle label="Bench" active={role === 'sub'} color={theme.colors.accent} onPress={() => setRole(p.id, 'sub')} />
                  </View>
                ) : (
                  <Text style={st.lockTag}>{elsewhere ? 'Other side' : 'Not eligible'}</Text>
                )}
                {teamId ? (
                  <Text
                    style={st.removeLink}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${p.fullName} from ${teamName}`}
                    onPress={async () => { await removePlayerFromTeam(teamId, p.id, matchId); setRosterNonce((n) => n + 1); }}
                  >
                    ✕
                  </Text>
                ) : null}
              </View>
            );
          })
        )}

        {/* Grow the squad right here — adds persist to the team for every match. */}
        {teamId && (
          <AddInvitePlayer
            fixedSide="home"
            title={roster.length === 0 ? '＋ Add players to this squad' : '＋ Add another player'}
            homeTeamId={teamId} awayTeamId={teamId}
            homeTeamName={teamName} awayTeamName={teamName}
            sport={sport} matchId={matchId}
            invited={roster.filter((p) => p.invited)}
            existingIds={roster.map((p) => p.id)}
            defaultOpen={roster.length === 0}
            onChanged={() => setRosterNonce((n) => n + 1)}
          />
        )}

        {hasPitch && roster.length > 0 && (
          <TouchableOpacity accessibilityRole="button" style={st.pitchBtn} activeOpacity={0.85} onPress={arrangeOnPitch} disabled={busy}>
            <Text style={st.pitchText}>⚽ Arrange on pitch (optional) ›</Text>
            <Text style={st.pitchHint}>Set exact positions & formation. Skip it — starters auto-fill the pitch.</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={st.footer}>
        <Button label={busy ? 'Saving…' : 'Save matchday squad'} onPress={save} />
      </View>
    </SafeAreaView>
  );
}

function Toggle({ label, active, color, disabled, onPress }: { label: string; active: boolean; color: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled: disabled && !active }} onPress={onPress} activeOpacity={0.8} disabled={disabled && !active} style={[st.toggle, active && { backgroundColor: color, borderColor: color }, disabled && !active && st.toggleDisabled]}>
      <Text style={[st.toggleText, active && st.toggleTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(3) },
  savedNote: { color: theme.colors.textMuted, fontSize: theme.font.small, marginTop: theme.spacing(2) },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(2) },
  copyBtn: { marginTop: theme.spacing(2), alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.primary, paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3) },
  copyText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  counterPill: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3), borderWidth: 1, borderColor: theme.colors.border },
  counterPillFull: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  counterText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  counterTextFull: { color: '#06120D' },
  quick: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1) },
  content: { padding: theme.spacing(4), gap: theme.spacing(2) },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  rowActive: { borderColor: theme.colors.primary },
  rowLocked: { opacity: 0.7, borderStyle: 'dashed' },
  lockedName: { color: theme.colors.textMuted },
  lockReason: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 2 },
  overrideReason: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 2 },
  lockTag: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  removeLink: { color: theme.colors.danger, fontSize: theme.font.body, fontWeight: '900', paddingHorizontal: theme.spacing(1) },
  testBanner: { backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  testBannerText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  toggles: { flexDirection: 'row', gap: theme.spacing(2) },
  toggle: {
    paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, minWidth: 58, alignItems: 'center',
  },
  toggleDisabled: { opacity: 0.4 },
  toggleText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  toggleTextActive: { color: '#06120D' },
  pitchBtn: { marginTop: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed', padding: theme.spacing(3), gap: 2 },
  pitchText: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  pitchHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  footer: { padding: theme.spacing(4), paddingTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
});
