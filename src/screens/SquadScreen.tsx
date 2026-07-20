/** Squad management for a team — a captain/coach adds players to the roster.
 *  The invite link (to hand squad-building to a captain) is a demo stub for now;
 *  full link auth + matchday XI/subs selection for every sport come next. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Card, Button, TextField, ScreenTitle, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { getTeamSummary, getPlayers, createPlayer, createInvite, getTeamLeaders, setTeamLeaders } from '../data/repos';
import { useCaptainships } from '../data/hooks';
import type { Player, TeamLeadership, TeamSummary } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

export default function SquadScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Squad'>>();
  const { teamId } = params;
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [squad, setSquad] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<TeamLeadership>({});
  const { isCaptain } = useCaptainships();
  const captain = isCaptain(teamId);

  const load = useCallback(() => {
    let on = true;
    getTeamSummary(teamId).then((t) => on && setTeam(t));
    getTeamLeaders(teamId).then((l) => on && setLeaders(l));
    getPlayers().then((ps) => {
      if (!on) return;
      getTeamSummary(teamId).then((t) => t && setSquad(ps.filter((p) => p.houseName === t.name)));
    });
    return () => { on = false; };
  }, [teamId]);
  useFocusEffect(load);

  const assignLeader = (role: 'captainId' | 'viceCaptainId', playerId: string) => {
    // setting a player as captain clears them from vice (and vice versa)
    const next: TeamLeadership = { ...leaders, [role]: leaders[role] === playerId ? undefined : playerId };
    if (role === 'captainId' && next.viceCaptainId === playerId) next.viceCaptainId = undefined;
    if (role === 'viceCaptainId' && next.captainId === playerId) next.captainId = undefined;
    setLeaders(next);
    void setTeamLeaders(teamId, next);
  };

  async function add() {
    if (!team || !name.trim()) return;
    setBusy(true);
    await createPlayer({
      fullName: name.trim(),
      houseName: team.name,
      houseColor: team.colorHex,
      sports: team.sports,
      jerseyNo: jersey ? Number(jersey) : undefined,
      city: undefined,
    });
    setName('');
    setJersey('');
    setBusy(false);
    load();
  }

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
        <ScreenTitle title={`${team.name} squad`} subtitle={`${squad.length} players · ${team.sports.map((s) => getSport(s).icon).join(' ')}`} />

        {captain && <Text style={st.captain}>✓ You’re the captain of {team.name}</Text>}

        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.body}>📨 Invite the captain / coach</Text>
          <Text style={textStyles.muted}>Generate a code/link they redeem under “Join a team” to manage this squad.</Text>
          <Button
            label={busy && !inviteCode ? 'Generating…' : inviteCode ? 'New invite code' : 'Generate invite link'}
            variant="ghost"
            onPress={async () => {
              setBusy(true);
              const inv = await createInvite(team.id, team.name);
              setInviteCode(inv.token);
              setBusy(false);
            }}
          />
          {inviteCode && (
            <Text style={st.link} selectable>
              Code: {inviteCode}{'\n'}sportfolio.app/join/{inviteCode}
            </Text>
          )}
        </Card>

        <Card style={{ gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>Add a player</Text>
          <View style={st.row}>
            <View style={st.flex2}><TextField label="Name" value={name} onChange={setName} placeholder="Player name" /></View>
            <View style={st.flex1}><TextField label="Jersey" value={jersey} onChange={(t) => setJersey(t.replace(/[^0-9]/g, ''))} placeholder="#" autoCapitalize="none" /></View>
          </View>
          <Button label={busy ? 'Adding…' : 'Add to squad'} onPress={add} />
        </Card>

        <Text style={[textStyles.h3, st.section]}>Squad</Text>
        {squad.length === 0 ? (
          <Text style={textStyles.muted}>No players yet — add them above or via the invite link.</Text>
        ) : (
          squad.map((p) => {
            const isCap = leaders.captainId === p.id;
            const isVice = leaders.viceCaptainId === p.id;
            return (
              <Card key={p.id} style={{ gap: theme.spacing(2) }}>
                <View style={st.playerRow}>
                  <View style={[st.avatar, { backgroundColor: (team.colorHex ?? theme.colors.surfaceAlt) + '33' }]}>
                    <Text style={[st.avatarText, { color: team.colorHex ?? theme.colors.primary }]}>
                      {p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>
                      {p.fullName}{p.jerseyNo ? ` · #${p.jerseyNo}` : ''}
                      {isCap ? '  (C)' : isVice ? '  (VC)' : ''}
                    </Text>
                    <Text style={textStyles.muted}>{p.sports.map((s) => getSport(s).icon).join(' ')}</Text>
                  </View>
                </View>
                <View style={st.leaderBtns}>
                  <Text style={[st.leaderBtn, isCap && st.leaderBtnOn]} onPress={() => assignLeader('captainId', p.id)}>
                    {isCap ? '★ Captain' : 'Make captain'}
                  </Text>
                  <Text style={[st.leaderBtn, isVice && st.leaderBtnOn]} onPress={() => assignLeader('viceCaptainId', p.id)}>
                    {isVice ? '★ Vice-captain' : 'Make vice-captain'}
                  </Text>
                </View>
              </Card>
            );
          })
        )}

        <Text style={st.note}>
          Matchday XI &amp; substitute selection is available for football (Lineup editor on the live match); rolling it out to every sport is next.
        </Text>
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
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic', marginTop: theme.spacing(2) },
});
