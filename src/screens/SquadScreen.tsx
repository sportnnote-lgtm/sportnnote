/** Squad management for a team — a captain/coach adds players to the roster.
 *  Players are added the one way used everywhere (AddInvitePlayer): by mobile
 *  number / from contacts for new people, or by number, name or email for anyone
 *  already on SportnNote — never a bare typed name. */
import { notice } from '../core/confirm';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { EmptyState, Card, Button, Pill, ScreenTitle, SelectChip, textStyles, plural } from '../components/ui';
import { getSport } from '../sports/registry';
import { getTeamSummary, getRoster, createInvite, getTeamLeaders, setTeamLeaders, setTeamAdmins, getMyPlayerId, getTeams, getPlayerEditAccess, getTeamPlayerRoles, setTeamPlayerRoles } from '../data/repos';
import { rolesForSport, sportHasRoles } from '../data/teamRoles';
import { displayableImage } from '../core/imageUrl';
import { isSupabaseConfigured } from '../core/supabase';
import type { EditAccess } from '../core/playerEditAccess';
import { AddInvitePlayer } from '../components/AddInvitePlayer';
import { useCaptainships, useTeamPermission } from '../data/hooks';
import { nextLeaders } from '../core/teamPermissions';
import { confirmAction } from '../core/confirm';
import { useAuth } from '../core/auth';
import { RemindInstall } from '../components/RemindInstall';
import type { Player, SportId, TeamLeadership, TeamSummary } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

export default function SquadScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Squad'>>();
  const { teamId } = params;
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [squad, setSquad] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<TeamLeadership>({});
  // Set when this is a club's sport team — its admins live on the club page.
  const [clubId, setClubId] = useState<string | null>(null);
  // This team row's own sport (a summary can span a house's sports) — drives roles.
  const [teamSport, setTeamSport] = useState<SportId | null>(null);
  const { isCaptain } = useCaptainships();
  const captain = isCaptain(teamId);
  // The server decides who may edit; null = still checking (stay read-only).
  const { canManage, refresh } = useTeamPermission(teamId);
  const { profile } = useAuth();
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => { void getMyPlayerId(profile?.id).then(setMyPlayerId); }, [profile?.id]);
  // Parity #12: who may fix each player's details (fetched once per squad load),
  // and the team's sport roles (managers set them; claimed players too).
  const [access, setAccess] = useState<Record<string, EditAccess>>({});
  const [roles, setRoles] = useState<Record<string, string[]>>({});

  const load = useCallback(() => {
    let on = true;
    getTeamLeaders(teamId).then((l) => on && setLeaders(l));
    getTeams().then((all) => {
      if (!on) return;
      const row = all.find((t) => t.id === teamId);
      setClubId(row?.clubId ?? null);
      setTeamSport(row?.sport ?? null);
    }).catch(() => undefined);
    // The same roster the match screens use (explicit roster, else house members).
    getTeamSummary(teamId).then(async (t) => {
      if (!on || !t) return;
      setTeam(t);
      const lists = await Promise.all(t.sports.map((sp) => getRoster(t.name, sp, t.id)));
      const seen = new Map<string, Player>();
      for (const p of lists.flat()) seen.set(p.id, p);
      const list = [...seen.values()];
      if (on) setSquad(list);
      const me = await getMyPlayerId(profile?.id);
      const acc = await Promise.all(list.map((p) => getPlayerEditAccess(p.id, me).catch((): EditAccess => 'none')));
      if (on) setAccess(Object.fromEntries(list.map((p, i) => [p.id, acc[i]])));
    });
    getTeamPlayerRoles(teamId).then((r) => on && setRoles(r)).catch(() => undefined);
    return () => { on = false; };
  }, [teamId, profile?.id]);

  const toggleRole = async (playerId: string, role: string) => {
    const cur = roles[playerId] ?? [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setRoles((r) => ({ ...r, [playerId]: next }));
    try {
      await setTeamPlayerRoles(teamId, playerId, next);
    } catch (e) {
      setRoles((r) => ({ ...r, [playerId]: cur }));
      notice('Couldn’t update roles', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  useFocusEffect(load);

  // Breadcrumb: name the nav bar after the team, not a generic "Squad".
  useEffect(() => {
    if (team) nav.setOptions({ title: team.name });
  }, [nav, team?.name]);

  const assignLeader = async (role: 'captainId' | 'viceCaptainId', playerId: string) => {
    const prev = leaders;
    const next = nextLeaders(prev, role, playerId); // captain ≠ VC
    const nameOf = (id?: string) => squad.find((p) => p.id === id)?.fullName ?? 'They';
    // Confirm only when someone loses a role.
    if (role === 'captainId' && prev.captainId && next.captainId && prev.captainId !== next.captainId) {
      if (!(await confirmAction('Change captain?', `Make ${nameOf(next.captainId)} captain? ${nameOf(prev.captainId)} will no longer be captain.`, 'Make captain'))) return;
    }
    const wasLeader = !!myPlayerId && (prev.captainId === myPlayerId || prev.viceCaptainId === myPlayerId);
    const stillLeader = !!myPlayerId && (next.captainId === myPlayerId || next.viceCaptainId === myPlayerId);
    if (wasLeader && !stillLeader) {
      if (!(await confirmAction('Step down?', `You'll stop managing ${team?.name ?? 'this team'} unless you're also an admin. Continue?`, 'Continue', true))) return;
    }
    setLeaders(next);
    try {
      await setTeamLeaders(teamId, next);
      if (wasLeader && !stillLeader) refresh();
    } catch (e) {
      setLeaders(prev);
      notice('Couldn’t update captain', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  // Team admins share squad duties with the captain (several allowed; an admin
  // can also be captain). Player ids, so unclaimed players work too.
  const toggleAdmin = async (playerId: string) => {
    const prev = leaders;
    const cur = prev.adminIds ?? [];
    const isAdmin = cur.includes(playerId);
    const next = { ...prev, adminIds: isAdmin ? cur.filter((x) => x !== playerId) : [...cur, playerId] };
    const iLoseIt = isAdmin && playerId === myPlayerId && prev.captainId !== myPlayerId && prev.viceCaptainId !== myPlayerId;
    if (iLoseIt && !(await confirmAction('Step down as admin?', `You’ll stop managing ${team?.name ?? 'this team'}. Continue?`, 'Continue', true))) return;
    setLeaders(next);
    try {
      await setTeamAdmins(teamId, next.adminIds);
      if (iLoseIt) refresh();
    } catch (e) {
      setLeaders(prev);
      notice('Couldn’t update admins', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  if (!team) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`${team.name} squad`} subtitle={`${plural(squad.length, 'player')} · ${team.sports.map((s) => getSport(s).icon).join(' ')}`} />

        {captain && <Text style={st.captain}>✓ You’re the captain of {team.name}</Text>}
        {canManage && (
          <Text style={st.link} accessibilityRole="link" onPress={() => nav.navigate('EditTeam', { teamId })}>✎ Edit team</Text>
        )}
        {canManage && clubId && (
          <Text style={textStyles.muted} onPress={() => nav.navigate('ClubHome', { clubId })}>Admins are set on the club page ›</Text>
        )}
        {canManage === false && <Text style={textStyles.muted}>Only the captain, vice-captain or team admins can edit this squad.</Text>}

        {/* Adding players is this page's main job — first, and already open. */}
        {canManage && <AddInvitePlayer
          fixedSide="home" defaultOpen
          title={squad.length === 0 ? '＋ Add players to this team' : '＋ Add more players'}
          homeTeamId={team.id} awayTeamId={team.id} homeTeamName={team.name} awayTeamName={team.name}
          sport={team.sports[0]} invited={squad.filter((p) => p.invited)} existingIds={squad.map((p) => p.id)}
          onChanged={load}
        />}

        <Text style={[textStyles.h3, st.section]}>Squad</Text>
        {squad.length === 0 ? (
          <EmptyState icon="👥" title="No players yet" hint={canManage ? "Add them above by mobile number or from your contacts." : undefined} compact />
        ) : (
          squad.map((p) => {
            const isCap = leaders.captainId === p.id;
            const isVice = leaders.viceCaptainId === p.id;
            const isAdmin = !!leaders.adminIds?.includes(p.id);
            // Admin chip: managers only; hidden before migration 0042 (adminIds
            // undefined) and for club teams (admins live on the club page).
            const showAdmin = !!canManage && leaders.adminIds !== undefined && !clubId;
            const sport = teamSport ?? (team.sports.length === 1 ? team.sports[0] : null);
            const showRoles = !!canManage && !!sport && sportHasRoles(sport);
            const pRoles = roles[p.id] ?? [];
            const photo = displayableImage(p.photoUrl, !isSupabaseConfigured);
            return (
              <Card key={p.id} style={{ gap: theme.spacing(2) }}>
                <View style={st.playerRow}>
                  <View style={[st.avatar, { backgroundColor: (team.colorHex ?? theme.colors.surfaceAlt) + '33' }]}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={st.avatarImg} accessibilityIgnoresInvertColors />
                    ) : (
                      <Text style={[st.avatarText, { color: team.colorHex ?? theme.colors.primary }]}>
                        {p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{p.fullName}{p.jerseyNo ? ` · #${p.jerseyNo}` : ''}{p.invited ? '  ⏳' : ''}</Text>
                    <Text style={textStyles.muted}>{p.invited ? 'Invited · not registered yet' : p.sports.map((s) => getSport(s).icon).join(' ')}{pRoles.length && !showRoles ? ` · ${pRoles.join(', ')}` : ''}</Text>
                    {access[p.id] === 'admin' ? (
                      <Text style={st.link} accessibilityRole="link" onPress={() => nav.navigate('EditProfile', { playerId: p.id, asAdmin: true })}>✎ Edit details</Text>
                    ) : canManage && p.profileId && access[p.id] !== 'self' ? (
                      <Text style={st.ownProfile}>Manages their own profile</Text>
                    ) : null}
                  </View>
                  {isCap ? (
                    <Pill label="★ C" color={theme.colors.primary + '22'} textColor={theme.colors.primary} />
                  ) : isVice ? (
                    <Pill label="VC" color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
                  ) : null}
                  {isAdmin ? <Pill label="Admin" color={theme.colors.surfaceAlt} textColor={theme.colors.primary} /> : null}
                </View>
                {/* Always-available re-share so a captain/coach can remind anyone who
                    hasn't installed yet — WhatsApp or SMS, from the team squad. */}
                {p.invited && canManage ? (
                  <RemindInstall playerId={p.id} name={p.fullName} phone={p.phone} teamName={team.name} captain={isCap} />
                ) : null}
                {canManage && <View style={st.leaderBtns}>
                  <Text
                    accessibilityRole="button"
                    accessibilityState={{ selected: isCap }}
                    style={[st.leaderBtn, isCap && st.leaderBtnOn]}
                    onPress={() => assignLeader('captainId', p.id)}
                  >
                    {isCap ? '★ Captain' : 'Make captain'}
                  </Text>
                  <Text
                    accessibilityRole="button"
                    accessibilityState={{ selected: isVice }}
                    style={[st.leaderBtn, isVice && st.leaderBtnOn]}
                    onPress={() => assignLeader('viceCaptainId', p.id)}
                  >
                    {isVice ? '★ Vice-captain' : 'Make vice-captain'}
                  </Text>
                  {showAdmin && (
                    <Text
                      accessibilityRole="button"
                      accessibilityState={{ selected: isAdmin }}
                      style={[st.leaderBtn, isAdmin && st.leaderBtnOn]}
                      onPress={() => void toggleAdmin(p.id)}
                    >
                      {isAdmin ? '★ Admin' : 'Make admin'}
                    </Text>
                  )}
                </View>}
                {showRoles && (
                  <View style={st.leaderBtns} accessibilityLabel={`${p.fullName}’s roles`}>
                    {rolesForSport(sport).map((r) => (
                      <SelectChip key={r} label={r} active={pRoles.includes(r)} onPress={() => void toggleRole(p.id, r)} />
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        )}

        {canManage && <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.body}>📨 Invite the captain / coach</Text>
          <Text style={textStyles.muted}>Generate a code/link they redeem under Settings → “Join a team with a code” to manage this squad.</Text>
          <Button
            label={busy && !inviteCode ? 'Generating…' : inviteCode ? 'New invite code' : 'Generate invite link'}
            variant="ghost"
            onPress={async () => {
              setBusy(true);
              try {
                const inv = await createInvite(team.id, team.name);
                setInviteCode(inv.token);
              } catch (e) {
                notice('Couldn’t create an invite', (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          {inviteCode && (
            <Text style={st.link} selectable>
              Code: {inviteCode}{'\n'}sportnnote.in/join/{inviteCode}
            </Text>
          )}
        </Card>}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  captain: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  section: { marginTop: theme.spacing(2) },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  leaderBtns: { flexDirection: 'row', gap: theme.spacing(2), flexWrap: 'wrap' },
  leaderBtn: {
    color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3),
  },
  leaderBtnOn: { color: theme.colors.primary, borderColor: theme.colors.primary },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  ownProfile: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontStyle: 'italic', marginTop: 2 },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic', marginTop: theme.spacing(2) },
});
