/** Squad management for a team — a captain/coach adds players to the roster.
 *  Players are added the one way used everywhere (AddInvitePlayer): by mobile
 *  number / from contacts for new people, or by number, name or email for anyone
 *  already on SportnNote — never a bare typed name. */
import { notice } from '../core/confirm';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { EmptyState, Card, Button, Pill, ScreenTitle, textStyles, plural } from '../components/ui';
import { getSport } from '../sports/registry';
import { getTeamSummary, getRoster, createInvite, getTeamLeaders, setTeamLeaders } from '../data/repos';
import { AddInvitePlayer } from '../components/AddInvitePlayer';
import { useCaptainships } from '../data/hooks';
import { RemindInstall } from '../components/RemindInstall';
import type { Player, TeamLeadership, TeamSummary } from '../core/types';
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
  const { isCaptain } = useCaptainships();
  const captain = isCaptain(teamId);

  const load = useCallback(() => {
    let on = true;
    getTeamLeaders(teamId).then((l) => on && setLeaders(l));
    // The same roster the match screens use (explicit roster, else house members).
    getTeamSummary(teamId).then(async (t) => {
      if (!on || !t) return;
      setTeam(t);
      const lists = await Promise.all(t.sports.map((sp) => getRoster(t.name, sp)));
      const seen = new Map<string, Player>();
      for (const p of lists.flat()) seen.set(p.id, p);
      if (on) setSquad([...seen.values()]);
    });
    return () => { on = false; };
  }, [teamId]);
  useFocusEffect(load);

  // Breadcrumb: name the nav bar after the team, not a generic "Squad".
  useEffect(() => {
    if (team) nav.setOptions({ title: team.name });
  }, [nav, team?.name]);

  const assignLeader = (role: 'captainId' | 'viceCaptainId', playerId: string) => {
    // setting a player as captain clears them from vice (and vice versa)
    const next: TeamLeadership = { ...leaders, [role]: leaders[role] === playerId ? undefined : playerId };
    if (role === 'captainId' && next.viceCaptainId === playerId) next.viceCaptainId = undefined;
    if (role === 'viceCaptainId' && next.captainId === playerId) next.captainId = undefined;
    setLeaders(next);
    void setTeamLeaders(teamId, next);
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

        {/* Adding players is this page's main job — first, and already open. */}
        <AddInvitePlayer
          fixedSide="home" defaultOpen
          title={squad.length === 0 ? '＋ Add players to this team' : '＋ Add more players'}
          homeTeamId={team.id} awayTeamId={team.id} homeTeamName={team.name} awayTeamName={team.name}
          sport={team.sports[0]} invited={squad.filter((p) => p.invited)} existingIds={squad.map((p) => p.id)}
          onChanged={load}
        />

        <Text style={[textStyles.h3, st.section]}>Squad</Text>
        {squad.length === 0 ? (
          <EmptyState icon="👥" title="No players yet" hint="Add them above by mobile number or from your contacts." compact />
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
                    <Text style={textStyles.body}>{p.fullName}{p.jerseyNo ? ` · #${p.jerseyNo}` : ''}{p.invited ? '  ⏳' : ''}</Text>
                    <Text style={textStyles.muted}>{p.invited ? 'Invited · not registered yet' : p.sports.map((s) => getSport(s).icon).join(' ')}</Text>
                  </View>
                  {isCap ? (
                    <Pill label="★ C" color={theme.colors.primary + '22'} textColor={theme.colors.primary} />
                  ) : isVice ? (
                    <Pill label="VC" color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
                  ) : null}
                </View>
                {/* Always-available re-share so a captain/coach can remind anyone who
                    hasn't installed yet — WhatsApp or SMS, from the team squad. */}
                {p.invited ? (
                  <RemindInstall playerId={p.id} name={p.fullName} phone={p.phone} teamName={team.name} captain={isCap} />
                ) : null}
                <View style={st.leaderBtns}>
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
                </View>
              </Card>
            );
          })
        )}

        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.body}>📨 Invite the captain / coach</Text>
          <Text style={textStyles.muted}>Generate a code/link they redeem under “Join a team” to manage this squad.</Text>
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
        </Card>

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
