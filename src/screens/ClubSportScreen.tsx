/** A team's profile for ONE sport (spec §7, §8, §13): the sport's leadership
 *  (captain + vice-captain), its squad (a subset of the team's members), and each
 *  squad player's sport-specific roles (cricket: Wicketkeeper/Batter/…; football:
 *  GK/DEF/…). Every choice here is independent of every other sport — a player can
 *  captain cricket and be a mere squad member in football. Backed by the per-sport
 *  `teams` row (its captain_id / vice_captain_id / roster) + team_player_roles. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Card, SelectChip, ScreenTitle, LoadingState, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { rolesForSport, sportHasRoles } from '../data/teamRoles';
import { useAuth } from '../core/auth';
import {
  getClub, getClubMembers, getClubTeam, addClubSport, getMyPlayerId,
  getTeamLeaders, setTeamLeaders, setTeamRoster, getTeamPlayerRoles, setTeamPlayerRoles,
} from '../data/repos';
import type { Club, ClubMemberView, Team, TeamLeadership, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { useTeamPermission } from '../data/hooks';
import { notice } from '../core/confirm';

export default function ClubSportScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ClubSport'>>();
  const { clubId, sport } = params;
  const plugin = getSport(sport);
  const { profile } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<ClubMemberView[]>([]);
  const [leaders, setLeaders] = useState<TeamLeadership>({});
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // player id whose role editor is open

  const load = useCallback(async () => {
    const [c, m, id] = await Promise.all([getClub(clubId), getClubMembers(clubId), getMyPlayerId(profile?.id)]);
    // Ensure the per-sport team row exists (it will, if the club plays this sport).
    const t = (await getClubTeam(clubId, sport)) ?? (await addClubSport(clubId, sport));
    const [ld, rl] = await Promise.all([getTeamLeaders(t.id), getTeamPlayerRoles(t.id)]);
    setClub(c); setMembers(m); setTeam(t); setLeaders(ld); setRoles(rl); setMyId(id); setLoading(false);
  }, [clubId, sport, profile?.id]);

  useEffect(() => { load(); }, [load]);

  // Club admins and creators, plus this sport's captain/VC (the server allows them too).
  const { canManage: teamManager } = useTeamPermission(team?.id);
  const amAdmin = members.some((m) => m.playerId === myId && m.role === 'admin') || (!!club && club.createdBy === profile?.id) || !!teamManager;
  const failed = (what: string, e: unknown) => notice(`Couldn’t ${what}`, e instanceof Error ? e.message : 'Please try again.');
  const squadIds = team?.roster ?? [];
  const inSquad = (pid: string) => squadIds.includes(pid);
  const squad = members.filter((m) => inSquad(m.playerId));
  const roleCatalog = rolesForSport(sport);

  async function toggleSquad(pid: string) {
    if (!team) return;
    setBusy(true);
    try {
      const next = inSquad(pid) ? squadIds.filter((x) => x !== pid) : [...squadIds, pid];
      await setTeamRoster(team.id, next);
      // Dropping a player from the squad also clears their captaincy for this sport.
      if (!next.includes(pid)) {
        const patch: TeamLeadership = { ...leaders };
        if (patch.captainId === pid) patch.captainId = undefined;
        if (patch.viceCaptainId === pid) patch.viceCaptainId = undefined;
        if (patch.captainId !== leaders.captainId || patch.viceCaptainId !== leaders.viceCaptainId) await setTeamLeaders(team.id, patch);
      }
      await load();
    } catch (e) {
      failed('update the squad', e);
      await load(); // back to what the server has
    } finally { setBusy(false); }
  }

  async function setLeader(kind: 'captainId' | 'viceCaptainId', pid: string) {
    if (!team) return;
    setBusy(true);
    try {
      const next: TeamLeadership = { ...leaders, [kind]: leaders[kind] === pid ? undefined : pid };
      // Captain and vice-captain can't be the same person.
      if (kind === 'captainId' && next.captainId && next.captainId === next.viceCaptainId) next.viceCaptainId = undefined;
      if (kind === 'viceCaptainId' && next.viceCaptainId && next.viceCaptainId === next.captainId) next.captainId = undefined;
      await setTeamLeaders(team.id, next);
      setLeaders(next);
    } catch (e) {
      failed('update captain', e);
    } finally { setBusy(false); }
  }

  async function toggleRole(pid: string, role: string) {
    if (!team) return;
    const cur = roles[pid] ?? [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setRoles((r) => ({ ...r, [pid]: next }));
    try {
      await setTeamPlayerRoles(team.id, pid, next);
    } catch (e) {
      setRoles((r) => ({ ...r, [pid]: cur }));
      failed('update roles', e);
    }
  }

  if (loading) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;

  const nameOf = (pid?: string) => members.find((m) => m.playerId === pid)?.player.fullName ?? '—';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title={`${plugin.icon} ${plugin.name}`} subtitle={`${club?.name ?? 'Team'} — ${plugin.name} profile`} />

        {/* Leadership */}
        <Text style={textStyles.h3}>Leadership</Text>
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.muted}>Captain: <Text style={textStyles.body}>{nameOf(leaders.captainId)}</Text></Text>
          <Text style={textStyles.muted}>Vice-captain: <Text style={textStyles.body}>{nameOf(leaders.viceCaptainId)}</Text></Text>
          {!amAdmin && <Text style={[textStyles.muted, { marginTop: theme.spacing(1) }]}>Only team admins can change leadership and squad.</Text>}
        </Card>

        {/* Squad */}
        <Text style={textStyles.h3}>Squad</Text>
        {members.length === 0 ? (
          <Card><Text style={textStyles.muted}>Add members to the team first, then pick this sport’s squad.</Text></Card>
        ) : (
          members.map((m) => {
            const picked = inSquad(m.playerId);
            const pRoles = roles[m.playerId] ?? [];
            return (
              <Card key={m.playerId} style={{ gap: theme.spacing(2) }}>
                <View style={st.memberRow}>
                  <TouchableOpacity disabled={!amAdmin || busy} onPress={() => toggleSquad(m.playerId)} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), flex: 1 }}>
                    <View style={[st.box, picked && st.boxOn]}>{picked && <Text style={st.tick}>✓</Text>}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{m.player.fullName}</Text>
                      {picked && (leaders.captainId === m.playerId || leaders.viceCaptainId === m.playerId) && (
                        <Text style={st.leaderTag}>{leaders.captainId === m.playerId ? '★ Captain' : '◇ Vice-captain'}{pRoles.length ? ` · ${pRoles.join(', ')}` : ''}</Text>
                      )}
                      {picked && leaders.captainId !== m.playerId && leaders.viceCaptainId !== m.playerId && pRoles.length > 0 && (
                        <Text style={st.leaderTag}>{pRoles.join(', ')}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  {picked && amAdmin && (
                    <TouchableOpacity onPress={() => setExpanded((e) => (e === m.playerId ? null : m.playerId))} accessibilityRole="button">
                      <Text style={st.link}>{expanded === m.playerId ? 'Done' : 'Edit'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {picked && amAdmin && expanded === m.playerId && (
                  <View style={{ gap: theme.spacing(2), paddingTop: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <Text style={textStyles.muted}>Leadership</Text>
                    <View style={st.chips}>
                      <SelectChip label="★ Captain" active={leaders.captainId === m.playerId} onPress={() => setLeader('captainId', m.playerId)} />
                      <SelectChip label="◇ Vice-captain" active={leaders.viceCaptainId === m.playerId} onPress={() => setLeader('viceCaptainId', m.playerId)} />
                    </View>
                    {sportHasRoles(sport) && (
                      <>
                        <Text style={textStyles.muted}>{plugin.name} role(s)</Text>
                        <View style={st.chips}>
                          {roleCatalog.map((r) => (
                            <SelectChip key={r} label={r} active={pRoles.includes(r)} onPress={() => toggleRole(m.playerId, r)} />
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                )}
              </Card>
            );
          })
        )}

        <Text style={[textStyles.muted, { marginTop: theme.spacing(2) }]}>
          {squad.length} in the {plugin.name} squad. Captains, roles and this squad are specific to {plugin.name} — other sports keep their own.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tick: { color: '#fff', fontWeight: '900', fontSize: 14 },
  link: { color: theme.colors.primary, fontWeight: '700' },
  leaderTag: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', marginTop: 2 },
});
