/** Organizer hub — the two primary actions (new tournament, schedule a match)
 *  up top, followed by the tournaments this user is currently hosting. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, Pill, ScreenTitle, EmptyState, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { useAuth } from '../core/auth';
import { useOrganizations } from '../data/hooks';
import { getMyPlayerId, getTournament, getTournaments, getOrganizations, getMyOrgRequests, respondToOrgRequest } from '../data/repos';
import { canManageTournament, orgsForPlayer } from '../core/org';
import type { OrgRequest } from '../core/types';
import { getSport } from '../sports/registry';
import { formatDayShort } from '../core/dates';
import type { RootStackParamList } from '../navigation/types';
import type { Tournament } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const today = () => new Date().toISOString().slice(0, 10);
type Status = 'live' | 'upcoming' | 'completed';
const statusOf = (t: Tournament): Status => {
  const d = today();
  if (d < t.startDate) return 'upcoming';
  if (d > t.endDate) return 'completed';
  return 'live';
};
const STATUS_META: Record<Status, { label: string; color: string; text: string }> = {
  live: { label: '🔴 Live', color: theme.colors.danger, text: '#06120D' },
  upcoming: { label: '📅 Upcoming', color: theme.colors.accent, text: '#06120D' },
  completed: { label: 'Completed', color: theme.colors.surfaceAlt, text: theme.colors.textMuted },
};

export default function OrganizeScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [hosted, setHosted] = useState<Tournament[]>([]);
  const [fallback, setFallback] = useState<Tournament | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [showHosted, setShowHosted] = useState(false);
  const [showCommunities, setShowCommunities] = useState(false);
  const orgs = useOrganizations();
  const myCommunities = orgsForPlayer(orgs, myId);
  const [myReqs, setMyReqs] = useState<OrgRequest[]>([]); // my pending invites + join-requests
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? 'a community';
  const myInvites = myReqs.filter((r) => r.direction === 'invite');
  const myRequests = myReqs.filter((r) => r.direction === 'request');
  const decideMyInvite = async (req: OrgRequest, accept: boolean) => {
    await respondToOrgRequest(req.id, accept, myId ?? undefined);
    if (myId) setMyReqs(await getMyOrgRequests(myId, 'pending'));
  };

  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getMyPlayerId(profile?.id), getTournaments(), getTournament(), getOrganizations()]).then(
        ([myId, all, current, orgs]) => {
          if (!on) return;
          setMyId(myId);
          if (myId) getMyOrgRequests(myId, 'pending').then((rs) => on && setMyReqs(rs));
          // Tournaments this user runs (personally or via a hosting org) that
          // haven't finished yet. Live first, then upcoming, by start date.
          const order: Record<Status, number> = { live: 0, upcoming: 1, completed: 2 };
          const mine = all
            .filter((t) => canManageTournament(t, orgs, myId) && statusOf(t) !== 'completed')
            .sort((a, b) => order[statusOf(a)] - order[statusOf(b)] || a.startDate.localeCompare(b.startDate));
          setHosted(mine);
          setFallback(current);
        }
      );
      return () => {
        on = false;
      };
    }, [profile?.id])
  );

  // Scheduling needs a tournament to file the match under: prefer a live one the
  // user hosts, else any hosted, else the current meet.
  const scheduleTarget = hosted[0] ?? fallback;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Organize" subtitle="Run your sports meet" />

        {/* Primary create action leads; supporting actions follow. */}
        <Button label="🏆 New tournament" onPress={() => nav.navigate('CreateTournament')} />
        <Button
          label="🤝 Start a friendly"
          variant="ghost"
          onPress={() => nav.navigate('ScheduleMatch', {})}
        />
        <Button
          label="🔁 New series / tie"
          variant="ghost"
          onPress={() => nav.navigate('CreateSeries', {})}
        />
        <Button label="📊 Organizer dashboard" variant="ghost" onPress={() => nav.navigate('OrganizerDashboard')} />
        <Text style={textStyles.muted}>
          Open a tournament to schedule its matches or auto-generate fixtures. A friendly is a one-off game — no tournament needed.
        </Text>

        <SectionHeader title="Tournaments you're hosting" count={hosted.length} onSeeAll={hosted.length > SECTION_CAP ? () => setShowHosted((v) => !v) : undefined} expanded={showHosted} />
        {hosted.length === 0 ? (
          <Card>
            <EmptyState
              icon="🏆"
              title="You're not hosting any tournaments"
              hint="Tap “New tournament” above to start one."
              compact
            />
          </Card>
        ) : (
          (showHosted ? hosted : hosted.slice(0, SECTION_CAP)).map((t) => {
            const meta = STATUS_META[statusOf(t)];
            return (
              <TouchableOpacity accessibilityRole="button"
                key={t.id}
                activeOpacity={0.85}
                onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}
              >
                <Card style={{ gap: theme.spacing(2) }}>
                  <View style={st.cardHead}>
                    <Text style={[textStyles.h3, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
                    <Pill label={meta.label} color={meta.color} textColor={meta.text} />
                  </View>
                  <Text style={textStyles.muted}>
                    {t.hostName} · {formatDayShort(t.startDate)} → {formatDayShort(t.endDate)}
                  </Text>
                  <View style={st.tags}>
                    {t.sports.map((s) => (
                      <Pill key={s} label={`${getSport(s).icon} ${getSport(s).name}`} />
                    ))}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        <Button
          label="🛡️ My teams"
          onPress={() => nav.navigate('Clubs')}
          style={{ marginTop: theme.spacing(2) }}
        />
        <Button
          label="👥 Manage houses"
          variant="ghost"
          onPress={() => nav.navigate('Teams')}
        />

        {/* Invitations to join a community, awaiting your decision. */}
        {myInvites.length > 0 && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Invitations · {myInvites.length}</Text>
            {myInvites.map((r) => (
              <View key={r.id} style={st.inviteRow}>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{orgName(r.orgId)} · as {r.role}</Text>
                <Text style={st.accept} onPress={() => void decideMyInvite(r, true)}>Accept</Text>
                <Text style={st.decline} onPress={() => void decideMyInvite(r, false)}>Decline</Text>
              </View>
            ))}
          </Card>
        )}

        <SectionHeader title="Communities" count={myCommunities.length} onSeeAll={myCommunities.length > SECTION_CAP ? () => setShowCommunities((v) => !v) : undefined} expanded={showCommunities} />
        <Text style={textStyles.muted}>A school, club, company… that runs recurring events.</Text>
        <Button label="🏛️ New community" variant="ghost" onPress={() => nav.navigate('CreateCommunity')} />
        <Button label="🔎 Find a community" variant="ghost" onPress={() => nav.navigate('DiscoverOrgs')} />
        {myRequests.length > 0 && (
          <Text style={textStyles.muted}>Requested to join: {myRequests.map((r) => orgName(r.orgId)).join(', ')} — awaiting approval.</Text>
        )}
        {(showCommunities ? myCommunities : myCommunities.slice(0, SECTION_CAP)).map((o) => (
          <TouchableOpacity accessibilityRole="button" key={o.id} activeOpacity={0.85} onPress={() => nav.navigate('Organization', { orgId: o.id })}>
            <Card style={st.cardHead}>
              <Text style={st.communityIcon}>🏛️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[textStyles.body, { fontWeight: '700' }]} numberOfLines={1}>{o.name}</Text>
                <Text style={textStyles.muted}>{[o.type, o.city].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={st.chevron}>›</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  accept: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
  decline: { color: theme.colors.danger, fontWeight: '700', fontSize: theme.font.small },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  communityIcon: { fontSize: 22 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginTop: theme.spacing(1) },
});
