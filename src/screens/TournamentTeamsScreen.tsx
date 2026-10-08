/** Tournament participants — the roster an organizer registers up front, before
 *  deciding a format. "How many teams are in?" is the first thing you need to
 *  split into groups or size a bracket, and until now a tournament had no team
 *  list (participation was only implied by its matches). Pick from the sport's
 *  teams (or add a new one), then Save. The count drives the format planner and
 *  the auto-fixtures team picker defaults to whatever's registered here.
 *
 *  Adding a team the real-event way: most teams aren't on the app yet, so the
 *  organizer enters them — and a team is a real entity, not an orphan shell. A
 *  new team is attributed to the hosting community, and you can capture a
 *  manager/captain contact who gets invited to claim the team & manage its
 *  squad (a team-claim invite → join link, sent by email / WhatsApp / SMS). */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, Linking, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, FormError, textStyles } from '../components/ui';
import { RegistrationBanner } from '../components/RegistrationBanner';
import { ClubQuickPick } from '../components/ClubQuickPick';
import { getSport, participantMode } from '../sports/registry';
import { useAuth } from '../core/auth';
import { useTournamentById, useTeams, useTournamentEntries, useTournamentCategories, useLeagueData, useCaptainships } from '../data/hooks';
import { addTournamentTeams, removeTournamentTeam, createTeam, invitePerson, setTeamLeaders, createInvite, setTournamentTeamStatus, setTournamentTeamCheckIn, getTeamLeaders, enterOrgHousesAsTeams, getLiveTournamentInvite, setTournamentInvite, getTeamsSetup, canManageTeam, getMyPlayerId, isNeedsDbUpdate } from '../data/repos';
import { filterTeams } from '../core/teamSearch';
import { tournamentInviteMessage, tournamentJoinLink } from '../core/tournamentInvite';
import { confirmAction, notice } from '../core/confirm';
import { sendInviteEmail, joinLink, inviteMessage } from '../core/invite';
import { openWhatsApp, openSms } from '../core/connect';
import { notify } from '../core/notifications';
import type { SportId, TournamentEntry } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const PALETTE = ['#FF5C5C', '#4DA3FF', '#3DDC97', '#FFB454', '#B98AFF', '#FF8AC4'];
/** Chips shown before "Show all N" — a school meet can have 60 teams. */
const CHIP_CAP = 30;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function TournamentTeamsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TournamentTeams'>>();
  const { profile } = useAuth();
  const tournament = useTournamentById(params.tournamentId);
  const tourSports = tournament?.sports ?? [];
  const inviterName = profile?.fullName ?? 'The organizer';

  const [sport, setSport] = useState<SportId>(params.sport ?? tourSports[0] ?? 'football');
  const [tick, setTick] = useState(0); // bump to refetch teams / registrations after a write
  const allTeams = useTeams(sport, tick);
  const entries = useTournamentEntries(params.tournamentId, sport, tick);
  const categories = useTournamentCategories(params.tournamentId, tick);
  const { matches } = useLeagueData(params.tournamentId);

  // Division (category) the organizer is editing. Null when the tournament runs
  // as a single implicit division. Teams are rostered per division.
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const activeCat = categories.length ? (activeCatId ?? categories[0].id) : null;
  const inScope = (e: TournamentEntry) => !activeCat || (e.categoryId ?? null) === activeCat;

  // Lifecycle entries the organizer must act on, scoped to the active division.
  const pending = entries.filter((e) => e.status === 'pending' && inScope(e));
  const invited = entries.filter((e) => e.status === 'invited' && inScope(e));
  const confirmedInScope = entries.filter((e) => e.status === 'confirmed' && inScope(e));
  const withdrawn = entries.filter((e) => e.status === 'withdrawn' && inScope(e));
  // Teams occupying a real spot (confirmed + invited) — drives the capacity banner.
  const enteredCount = confirmedInScope.length + invited.length;
  // A team enters exactly one division: hide teams entered elsewhere (another
  // division, or awaiting a decision); confirmed teams in THIS division stay as
  // selectable chips.
  const entryByTeam = new Map(entries.map((e) => [e.team.id, e] as const));
  const pickable = allTeams.filter((t) => {
    const e = entryByTeam.get(t.id);
    return !e || (e.status === 'confirmed' && inScope(e));
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inline "add a team" mini-form.
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [adding, setAdding] = useState(false);
  // How newly-picked teams enter: directly confirmed, or invited (captain accepts).
  const [entryMode, setEntryMode] = useState<'confirmed' | 'invited'>('confirmed');
  // Optional team manager/captain captured while adding — attributes the team to
  // a real person and invites them to claim it & manage the squad.
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrName, setMgrName] = useState('');
  const [mgrPhone, setMgrPhone] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  // Confirmation shown after a team is added (with an optional share-invite CTA).
  const [added, setAdded] = useState<{ note: string; link?: string; phone?: string; name?: string; context?: string } | null>(null);
  // Quick search over the team chips.
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  // Join link: a code, null = OFF, undefined = loading / database predates it.
  const [inviteToken, setInviteToken] = useState<string | null | undefined>(undefined);
  const [inviteNeedsDb, setInviteNeedsDb] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Confirmed rows: next-step subtitle + which teams I may edit.
  const [setup, setSetup] = useState<Record<string, { hasCaptain: boolean; players: number }>>({});
  const [manageable, setManageable] = useState<Set<string>>(new Set());
  const { isCaptain } = useCaptainships();

  // Seed the selection from what's confirmed in the active division — but only
  // until the user edits it, so a background refetch doesn't clobber in-progress
  // changes. Reseeds when the division switches.
  useEffect(() => {
    if (dirty) return;
    const ids = entries.filter((e) => e.status === 'confirmed' && inScope(e)).map((e) => e.team.id);
    setSelected(ids);
    setOriginal(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activeCat, dirty]);

  // Keep the sport valid on multi-sport meets.
  useEffect(() => {
    if (tourSports.length && !tourSports.includes(sport)) setSport(tourSports[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  // The tournament's join link (organiser).
  useEffect(() => {
    let on = true;
    void getLiveTournamentInvite(params.tournamentId).then((t) => {
      if (!on) return;
      setInviteToken(t);
      if (t === undefined) setInviteNeedsDb(true);
    });
    return () => { on = false; };
  }, [params.tournamentId]);

  // Next step per confirmed team ("No captain yet" / "No players yet") and
  // whether I may edit it (the server decides — organisers can't edit teams
  // they don't manage).
  const confirmedKey = confirmedInScope.map((e) => e.team.id).join(',');
  useEffect(() => {
    const ids = confirmedKey ? confirmedKey.split(',') : [];
    if (!ids.length) { setSetup({}); setManageable(new Set()); return; }
    let on = true;
    void getTeamsSetup(ids).then((r) => on && setSetup(r));
    void (async () => {
      const myPlayerId = await getMyPlayerId(profile?.id);
      const oks = await Promise.all(ids.map((id) =>
        canManageTeam(id, { profileId: profile?.id, myPlayerId, role: profile?.role, isCaptainStore: isCaptain(id) }).catch(() => false)));
      if (on) setManageable(new Set(ids.filter((_, i) => oks[i])));
    })();
    return () => { on = false; };
  }, [confirmedKey, profile?.id, profile?.role, isCaptain, tick]);

  async function toggleInvite(on: boolean) {
    setInviteBusy(true); setCopied(false);
    try {
      setInviteToken(await setTournamentInvite(params.tournamentId, on));
    } catch (e) {
      if (isNeedsDbUpdate(e)) { setInviteNeedsDb(true); setInviteToken(undefined); }
      else notice('Couldn’t change the join link', errMsg(e, 'Please try again.'));
    } finally { setInviteBusy(false); }
  }
  async function copyInviteLink(token: string) {
    const link = tournamentJoinLink(token);
    const clip = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    try {
      if (clip) { await clip.writeText(link); setCopied(true); return; }
      await Share.share({ message: link });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      notice('Couldn’t copy the link', link);
    }
  }
  const shareInviteWhatsApp = (token: string) => {
    const msg = tournamentInviteMessage({ tournamentName: tournament?.name ?? 'our tournament', inviterName: profile?.fullName, token });
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  // Teams with fixtures in this tournament — removing those loses them from the
  // list while their matches remain; Withdraw is the right tool.
  // (Demo data keys pickers by `${sport}-${shortName}`; live ids match directly.)
  const withFixtures = (teamId: string) => matches.some((m) => [m.homeTeam, m.awayTeam].some((t) => !!t && (t.id === teamId || `${m.sport}-${t.shortName}` === teamId)));
  const tourName = tournament?.name ?? 'the tournament';

  const pickSport = (s: SportId) => { setSport(s); setDirty(false); };
  const pickCategory = (id: string) => { setActiveCatId(id); setDirty(false); setAdded(null); };
  const toggle = (id: string) => {
    setDirty(true);
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  // Teams already appearing in this tournament's fixtures that aren't registered
  // yet — a one-tap way to backfill participants for a tournament with matches.
  const inFixtures = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) if (m.sport === sport) { ids.add(m.homeTeam.id); ids.add(m.awayTeam.id); }
    return [...ids].filter((id) => allTeams.some((t) => t.id === id));
  }, [matches, sport, allTeams]);
  const unregisteredInFixtures = inFixtures.filter((id) => !selected.includes(id));

  async function addNewTeam() {
    if (!name.trim() || !short.trim()) return setError('Name and short code are required.');
    setError(null); setBusy(true); setAdded(null);
    try {
      // Attribute the team to the hosting community, when there is one, so it
      // isn't an orphan shell.
      const t = await createTeam({
        name: name.trim(),
        shortName: short.trim().toUpperCase(),
        sport,
        colorHex: color,
        orgId: tournament?.hostOrgId,
      });

      // If a manager/captain contact was given, tie a real person to the team and
      // invite them to claim it + manage the squad (team-claim invite → join link).
      const mName = mgrName.trim();
      const mPhone = mgrPhone.trim();
      const mEmail = mgrEmail.trim();
      const context = `${t.name}${tournament ? ` at ${tournament.name}` : ''}`;
      if (mName || mPhone || mEmail) {
        const { player } = await invitePerson({ name: mName || t.name, phone: mPhone || undefined, email: mEmail || undefined });
        await setTeamLeaders(t.id, { captainId: player.id });
        const invite = await createInvite(t.id, t.name, 'captain');
        const link = joinLink(invite.token);
        if (mEmail) {
          const sent = await sendInviteEmail(mEmail, { name: player.fullName, inviterName, link, context, role: 'manage' });
          setAdded({ note: sent ? `✅ ${t.name} added · invite emailed to ${player.fullName}.` : `✅ ${t.name} added · couldn’t email — share this link with ${player.fullName}: ${link}` });
        } else {
          // No email: offer WhatsApp/SMS (opens the app) and show the link to share.
          setAdded({ note: `✅ ${t.name} added · invite ${player.fullName} to manage the squad:`, link, phone: mPhone || undefined, name: player.fullName, context });
        }
      } else {
        setAdded({ note: `✅ ${t.name} added.` });
      }

      setName(''); setShort(''); setMgrName(''); setMgrPhone(''); setMgrEmail(''); setMgrOpen(false); setAdding(false);
      setDirty(true);
      setSelected((p) => [...p, t.id]);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add team');
    } finally { setBusy(false); }
  }

  // Organizer acts on a request/invite. `confirm` → the team is in; otherwise the
  // entry is dropped. Either way the team's captain is notified of the outcome.
  async function decide(entry: TournamentEntry, confirm: boolean) {
    if (!confirm) {
      const ok = entry.status === 'invited'
        ? await confirmAction(`Cancel ${entry.team.name}’s invite?`, `${entry.team.name} won’t be able to accept and will be dropped from ${tourName}.`, 'Cancel invite', true)
        : await confirmAction(`Decline ${entry.team.name}?`, `Their request to join ${tourName} will be turned down.`, 'Decline', true);
      if (!ok) return;
    }
    setError(null); setBusy(true);
    try {
      if (confirm) await setTournamentTeamStatus(params.tournamentId, entry.team.id, 'confirmed');
      else await removeTournamentTeam(params.tournamentId, entry.team.id);
      const { captainId } = await getTeamLeaders(entry.team.id);
      if (captainId) {
        const where = tournament?.name ?? 'the tournament';
        void notify(confirm
          ? { title: `${entry.team.name} is in! 🎉`, body: `Your entry to ${where} was confirmed.`, playerId: captainId }
          : { title: `${entry.team.name} — entry update`, body: `Your entry to ${where} wasn’t accepted.`, playerId: captainId });
      }
      setTick((n) => n + 1);
    } catch (e) {
      notice('Couldn’t update the entry', errMsg(e, 'Please try again.'));
    } finally { setBusy(false); }
  }

  // Soft lifecycle change (withdraw a confirmed team, or reinstate a withdrawn one)
  // — keeps the entry + its history, unlike a hard remove.
  async function changeStatus(entry: TournamentEntry, status: 'confirmed' | 'withdrawn') {
    if (status === 'withdrawn' && !(await confirmAction(
      `Withdraw ${entry.team.name}?`,
      `${entry.team.name} is pulled out of ${tourName}: kept for the record, out of the fixtures. You can reinstate it later.`,
      'Withdraw', true,
    ))) return;
    setError(null); setBusy(true);
    try {
      await setTournamentTeamStatus(params.tournamentId, entry.team.id, status);
      setTick((n) => n + 1);
    } catch (e) {
      notice('Couldn’t update the entry', errMsg(e, 'Please try again.'));
    } finally { setBusy(false); }
  }
  // Match-day check-in: tap to mark a team as arrived (tap again to undo).
  async function toggleCheckIn(entry: TournamentEntry) {
    setError(null); setBusy(true);
    try {
      await setTournamentTeamCheckIn(params.tournamentId, entry.team.id, !entry.checkedInAt);
      setTick((n) => n + 1);
    } catch (e) {
      notice('Couldn’t update check-in', errMsg(e, 'Please try again.'));
    } finally { setBusy(false); }
  }
  // Hard-remove an entry (used on a withdrawn team the organizer wants gone).
  async function removeEntry(entry: TournamentEntry) {
    const hint = withFixtures(entry.team.id)
      ? `\n\n${entry.team.name} has fixtures here — keeping it Withdrawn keeps its record.`
      : '';
    if (!(await confirmAction(`Remove ${entry.team.name} from ${tourName}?`, `It’s dropped from the list (the team itself isn’t deleted).${hint}`, 'Remove', true))) return;
    setError(null); setBusy(true);
    try {
      await removeTournamentTeam(params.tournamentId, entry.team.id);
      setTick((n) => n + 1);
    } catch (e) {
      notice('Couldn’t remove the team', errMsg(e, 'Please try again.'));
    } finally { setBusy(false); }
  }

  async function save() {
    const added = selected.filter((id) => !original.includes(id));
    const removed = original.filter((id) => !selected.includes(id));
    if (removed.length) {
      const nameOf = (id: string) => allTeams.find((t) => t.id === id)?.name ?? entryByTeam.get(id)?.team.name ?? 'A team';
      const playing = removed.filter(withFixtures).map(nameOf);
      const title = removed.length === 1 ? `Remove ${nameOf(removed[0])} from ${tourName}?` : `Remove ${removed.length} teams from ${tourName}?`;
      const hint = playing.length
        ? `\n\n${playing.join(', ')} ${playing.length === 1 ? 'has' : 'have'} fixtures here — use Withdraw instead to keep ${playing.length === 1 ? 'its' : 'their'} results.`
        : '';
      if (!(await confirmAction(title, `They’re dropped from the list (the teams themselves aren’t deleted).${hint}`, 'Remove', true))) return;
    }
    setError(null); setBusy(true);
    try {
      if (added.length) await addTournamentTeams(params.tournamentId, added, entryMode, activeCat ?? undefined);
      for (const id of removed) await removeTournamentTeam(params.tournamentId, id);
      // Invited teams: let each captain know they've been invited to accept.
      if (entryMode === 'invited') {
        for (const id of added) {
          const { captainId } = await getTeamLeaders(id);
          const team = allTeams.find((t) => t.id === id);
          if (captainId) void notify({ title: `📨 You're invited — ${tournament?.name ?? 'a tournament'}`, body: `${team?.name ?? 'Your team'} was invited to join. Open the tournament to accept.`, playerId: captainId });
        }
      }
      setDirty(false);
      setTick((n) => n + 1);
      nav.goBack();
    } catch (e) {
      setTick((n) => n + 1);
      notice('Couldn’t save participants', errMsg(e, 'Please try again.'));
    } finally { setBusy(false); }
  }

  const sportName = getSport(sport).name;
  // Individual sports register individual entrants (a tennis draw is players, not
  // teams), doubles register pairs. Derived from the *currently selected* sport +
  // its format, so a multi-sport meet adapts per sport. Entries ride the same
  // ad-hoc-team plumbing under the hood — only the wording changes.
  const pMode = participantMode(sport, tournament?.formats?.[sport] as Record<string, unknown> | undefined);
  const noun = pMode === 'individual' ? 'player' : pMode === 'pairs' ? 'pair' : 'team';
  const nounPl = `${noun}s`;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`Participating ${nounPl}`} subtitle={tournament?.name ?? 'Register who’s in'} />

        {tourSports.length > 1 && (
          <>
            <Text style={textStyles.muted}>Sport</Text>
            <View style={st.chips}>
              {tourSports.map((s) => (
                <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={sport === s} onPress={() => pickSport(s)} />
              ))}
            </View>
          </>
        )}

        {/* Division selector — when the meet runs age × gender divisions, teams
            are rostered per division. */}
        {categories.length > 0 && (
          <>
            <Text style={textStyles.muted}>Division</Text>
            <View style={st.chips}>
              {categories.map((c) => (
                <SelectChip key={c.id} label={c.label} active={activeCat === c.id} onPress={() => pickCategory(c.id)} />
              ))}
            </View>
          </>
        )}

        {tournament && <RegistrationBanner tournament={tournament} enteredCount={enteredCount} />}

        {/* Join link: captains enter their own team from one WhatsApp link (or
            type its code under "Join a team"). Entries are confirmed at once. */}
        {pMode === 'team' && (inviteNeedsDb ? (
          <Text style={textStyles.muted}>Join by link · Needs the latest database update</Text>
        ) : inviteToken !== undefined && (
          <Card style={{ gap: theme.spacing(2) }}>
            <View style={st.rowBetween}>
              <Text style={[textStyles.body, st.flex1]}>🔗 Teams can join by link</Text>
              <Switch value={!!inviteToken} onValueChange={(v) => void toggleInvite(v)} disabled={inviteBusy} accessibilityLabel="Teams can join by link" />
            </View>
            {inviteToken ? (
              <>
                <Text style={textStyles.muted}>Captains open the link (or type the code under “Join a team”) and pick their team — it’s in at once.</Text>
                <Text style={st.code} selectable>{inviteToken}</Text>
                <View style={st.chips}>
                  <Button label="💬 WhatsApp" variant="ghost" onPress={() => shareInviteWhatsApp(inviteToken)} />
                  <Button label={copied ? 'Copied ✓' : 'Copy link'} variant="ghost" onPress={() => void copyInviteLink(inviteToken)} />
                </View>
                <Text style={textStyles.muted}>Turn this off once every team is in.</Text>
              </>
            ) : (
              <Text style={textStyles.muted}>Off — turn it on to share one link every captain can use to enter their team.</Text>
            )}
          </Card>
        ))}

        {/* Lifecycle gate: requests to join (approve/decline), pending invites
            (confirm/cancel), and withdrawals (reinstate/remove). Only confirmed
            teams count toward the format. */}
        {(pending.length > 0 || invited.length > 0 || withdrawn.length > 0) && (
          <Card style={{ gap: theme.spacing(3) }}>
            {pending.length > 0 && (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>Requests to join · {pending.length}</Text>
                {pending.map((e) => (
                  <View key={e.team.id} style={st.entryRow}>
                    <Text style={[textStyles.body, st.flex1]} numberOfLines={1}>{e.team.name}</Text>
                    <Button label="Accept" onPress={() => decide(e, true)} disabled={busy} />
                    <Button label="Decline" variant="ghost" onPress={() => decide(e, false)} disabled={busy} />
                  </View>
                ))}
              </View>
            )}
            {invited.length > 0 && (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>Invited · {invited.length}</Text>
                <Text style={textStyles.muted}>Awaiting the captain’s acceptance — or confirm them yourself.</Text>
                {invited.map((e) => (
                  <View key={e.team.id} style={st.entryRow}>
                    <Text style={[textStyles.body, st.flex1]} numberOfLines={1}>{e.team.name}</Text>
                    <Button label="Confirm" onPress={() => decide(e, true)} disabled={busy} />
                    <Button label="Cancel" variant="ghost" onPress={() => decide(e, false)} disabled={busy} />
                  </View>
                ))}
              </View>
            )}
            {withdrawn.length > 0 && (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>Withdrawn · {withdrawn.length}</Text>
                <Text style={textStyles.muted}>Pulled out — kept for the record, and out of the fixtures. Reinstate to bring a team back.</Text>
                {withdrawn.map((e) => (
                  <View key={e.team.id} style={st.entryRow}>
                    <Text style={[textStyles.body, st.flex1, st.dim]} numberOfLines={1}>{e.team.name}</Text>
                    <Button label="Reinstate" onPress={() => changeStatus(e, 'confirmed')} disabled={busy} />
                    <Button label="Remove" variant="ghost" onPress={() => removeEntry(e)} disabled={busy} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Confirmed teams — each can be withdrawn (soft, keeps history) without
            losing its place in past results. */}
        {confirmedInScope.length > 0 && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>In the tournament · {confirmedInScope.length}</Text>
            <Text style={textStyles.muted}>
              Match day: tap Check in as each {noun} arrives · {confirmedInScope.filter((e) => e.checkedInAt).length}/{confirmedInScope.length} here
            </Text>
            {confirmedInScope.map((e) => (
              <View key={e.team.id} style={st.entryRow}>
                <View style={st.flex1}>
                  <Text style={textStyles.body} numberOfLines={1}>{e.checkedInAt ? '✅ ' : ''}{e.team.name}</Text>
                  {pMode === 'team' && (() => {
                    const s = setup[e.team.id];
                    const next = !s ? null : !s.hasCaptain ? 'No captain yet' : s.players === 0 ? 'No players yet' : null;
                    return next || manageable.has(e.team.id) ? (
                      <Text style={textStyles.muted} numberOfLines={1}>
                        {next}{next && manageable.has(e.team.id) ? ' · ' : ''}
                        {manageable.has(e.team.id) && (
                          <Text style={st.link} accessibilityRole="link" onPress={() => nav.navigate('EditTeam', { teamId: e.team.id })}>Edit</Text>
                        )}
                      </Text>
                    ) : null;
                  })()}
                </View>
                <SelectChip label={e.checkedInAt ? 'Checked in' : 'Check in'} active={!!e.checkedInAt} onPress={() => void toggleCheckIn(e)} />
                <Button label="Withdraw" variant="ghost" onPress={() => changeStatus(e, 'withdrawn')} disabled={busy} />
              </View>
            ))}
          </Card>
        )}

        <View style={st.rowBetween}>
          <Text style={textStyles.h3}>{selected.length} {selected.length === 1 ? noun : nounPl} in</Text>
          {pickable.length > 0 && (
            <Text style={st.link} onPress={() => { setDirty(true); setSelected(selected.length === pickable.length ? [] : pickable.map((t) => t.id)); }}>
              {selected.length === pickable.length ? 'Clear all' : 'Select all'}
            </Text>
          )}
        </View>

        {unregisteredInFixtures.length > 0 && (
          <Text style={st.hint} onPress={() => { setDirty(true); setSelected((p) => [...new Set([...p, ...inFixtures])]); }}>
            ＋ {unregisteredInFixtures.length} {unregisteredInFixtures.length === 1 ? noun : nounPl} already playing here aren’t registered — tap to add them.
          </Text>
        )}

        {pickable.length > 0 && (
          <View style={st.chips}>
            <SelectChip label="Add directly" active={entryMode === 'confirmed'} onPress={() => setEntryMode('confirmed')} />
            <SelectChip label="Invite (captain accepts)" active={entryMode === 'invited'} onPress={() => setEntryMode('invited')} />
          </View>
        )}

        {/* Inter-house tournament hosted by a school → one tap enters its Houses. */}
        {pMode === 'team' && tournament?.participation === 'inter_house' && tournament?.hostOrgId && (
          <Button
            label={busy ? 'Adding…' : '🏠 Enter the school’s Houses'}
            variant="ghost"
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const n = await enterOrgHousesAsTeams(params.tournamentId, tournament.hostOrgId!, sport);
                if (n === 0) setError('This school hasn’t set up any Houses yet — add them in the school’s Members tab.');
                setTick((x) => x + 1);
              } finally { setBusy(false); }
            }}
          />
        )}

        {/* Pick one of your own multi-sport teams — its captain + squad come with
            it (spec §16). Picking a club that doesn't play this sport yet mints its
            profile on the fly. Individual/pairs entries don't use clubs. */}
        {pMode === 'team' && (
          <ClubQuickPick
            sport={sport}
            selectedTeamIds={selected}
            onPicked={(team) => { setDirty(true); setSelected((p) => [...new Set([...p, team.id])]); setTick((n) => n + 1); }}
          />
        )}

        {pickable.length === 0 ? (
          <Text style={textStyles.muted}>No {sportName} {nounPl} to add yet. Add one below.</Text>
        ) : (() => {
          const hits = filterTeams(pickable, query, selected);
          const shown = showAll ? hits : hits.slice(0, CHIP_CAP);
          return (
            <>
              <TextField label="" value={query} onChange={(v) => { setQuery(v); setShowAll(false); }} placeholder={`Search ${nounPl}`} autoCapitalize="none" />
              {hits.length === 0 ? (
                <Text style={textStyles.muted}>No {nounPl} match “{query.trim()}”.</Text>
              ) : (
                <View style={st.chips}>
                  {shown.map((t) => (
                    <SelectChip key={t.id} label={t.name} active={selected.includes(t.id)} onPress={() => toggle(t.id)} />
                  ))}
                </View>
              )}
              {hits.length > shown.length && (
                <Text style={st.link} accessibilityRole="button" onPress={() => setShowAll(true)}>Show all {hits.length}</Text>
              )}
            </>
          );
        })()}

        {/* Inline add-a-team so an organizer can build the roster without leaving. */}
        {adding ? (
          <Card style={{ gap: theme.spacing(3) }}>
            <Text style={textStyles.h3}>Add a {sportName} {noun}</Text>
            <View style={st.row}>
              <View style={st.flex2}><TextField label="Name" value={name} onChange={setName} placeholder={pMode === 'individual' ? 'Rafael Nadal' : pMode === 'pairs' ? 'Nadal / Alcaraz' : 'Red House'} /></View>
              <View style={st.flex1}><TextField label="Short" value={short} onChange={setShort} placeholder={pMode === 'team' ? 'RED' : 'RN'} autoCapitalize="characters" /></View>
            </View>
            <Text style={textStyles.muted}>Colour</Text>
            <View style={st.chips}>
              {PALETTE.map((c) => (
                <Text key={c} accessibilityRole="button" onPress={() => setColor(c)} style={[st.swatch, { backgroundColor: c }, color === c && st.swatchActive]} />
              ))}
            </View>

            {/* Optional contact: for a team it's the manager/captain (invited to
                claim the team & set its squad); for a pair, whoever to reach. An
                individual entrant is their own contact, so this is hidden there. */}
            {pMode !== 'individual' && (mgrOpen ? (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.muted}>
                  {pMode === 'pairs' ? 'Pair contact — invited to claim the entry and set both players.' : 'Team manager / captain — they’ll be invited to claim the team and set its squad.'}
                </Text>
                <TextField label={pMode === 'pairs' ? 'Contact name' : 'Manager name'} value={mgrName} onChange={setMgrName} placeholder={pMode === 'pairs' ? 'Who to reach for this pair?' : 'Who runs this team?'} />
                <View style={st.row}>
                  <View style={st.flex1}><TextField label="Phone" value={mgrPhone} onChange={setMgrPhone} placeholder="+91…" autoCapitalize="none" /></View>
                  <View style={st.flex1}><TextField label="Email" value={mgrEmail} onChange={setMgrEmail} placeholder="name@email.com" autoCapitalize="none" /></View>
                </View>
              </View>
            ) : (
              <Text style={st.link} onPress={() => setMgrOpen(true)}>＋ Add a {pMode === 'pairs' ? 'pair' : 'team'} contact (optional)</Text>
            ))}

            <View style={st.row}>
              <View style={st.flex1}><Button label="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} /></View>
              <View style={st.flex1}><Button label={busy ? 'Adding…' : 'Add & select'} onPress={addNewTeam} disabled={busy} /></View>
            </View>
          </Card>
        ) : (
          <Button label={`＋ New ${noun}`} variant="ghost" onPress={() => setAdding(true)} />
        )}

        {added && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.body}>{added.note}</Text>
            {added.link && (
              <View style={st.chips}>
                {added.phone ? (
                  <>
                    <Button label="💬 WhatsApp" variant="ghost" onPress={() => openWhatsApp(added.phone!, inviteMessage({ name: added.name ?? '', inviterName, link: added.link!, context: added.context, role: 'manage' }))} />
                    <Button label="✉️ SMS" variant="ghost" onPress={() => openSms(added.phone!, inviteMessage({ name: added.name ?? '', inviterName, link: added.link!, context: added.context, role: 'manage' }))} />
                  </>
                ) : null}
              </View>
            )}
            <Text style={st.link} onPress={() => setAdded(null)}>Dismiss</Text>
          </Card>
        )}

        <FormError message={error} />
        <Button
          label={busy ? 'Saving…' : !dirty ? 'Done' : entryMode === 'invited' ? 'Send invites & save' : `Save ${selected.length} participant${selected.length === 1 ? '' : 's'}`}
          onPress={save}
          disabled={busy}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dim: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  hint: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  swatchActive: { borderColor: theme.colors.text },
  code: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', letterSpacing: 2 },
});
