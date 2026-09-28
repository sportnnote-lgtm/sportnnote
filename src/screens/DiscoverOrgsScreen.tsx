/** Discover organizations and request to join (spec §5). Orgs are discoverable —
 *  anyone can find one and see its public info — but joining is never automatic:
 *  you send a join-request that an Owner/Admin accepts. Shows your pending request
 *  state and hides communities you already belong to. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, TextField, ScreenTitle, LoadingState, EmptyState, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { getOrganizations, getMyPlayerId, getMyOrgRequests, requestToJoinOrg } from '../data/repos';
import { isActiveMember } from '../core/org';
import type { Organization, OrgRequest } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DiscoverOrgsScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [myReqs, setMyReqs] = useState<OrgRequest[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = await getMyPlayerId(profile?.id);
    const [os, reqs] = await Promise.all([getOrganizations(), id ? getMyOrgRequests(id, 'pending') : Promise.resolve([])]);
    setMyId(id); setOrgs(os); setMyReqs(reqs); setLoading(false);
  }, [profile?.id]);
  useEffect(() => { load(); }, [load]);

  const pendingFor = (orgId: string) => myReqs.find((r) => r.orgId === orgId && r.direction === 'request');
  const q = query.trim().toLowerCase();
  const list = orgs
    .filter((o) => !isActiveMember(o, myId))
    .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.city ?? '').toLowerCase().includes(q) || (o.type ?? '').toLowerCase().includes(q));

  async function request(orgId: string) {
    if (!myId) return;
    setBusy(orgId);
    try { await requestToJoinOrg(orgId, myId); await load(); }
    finally { setBusy(null); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Find a community" subtitle="Search organizations and request to join" />
        <TextField label="" value={query} onChange={setQuery} placeholder="Search by name, city or type" autoCapitalize="none" />

        {loading ? (
          <LoadingState />
        ) : list.length === 0 ? (
          <EmptyState icon="🏛️" title={q ? 'No matches' : 'Nothing to join'} hint={q ? 'Try a different search.' : 'You already belong to every community here.'} />
        ) : (
          list.map((o) => {
            const pending = pendingFor(o.id);
            return (
              <Card key={o.id} style={st.row}>
                <TouchableOpacity style={{ flex: 1 }} accessibilityRole="button" activeOpacity={0.85} onPress={() => nav.navigate('Organization', { orgId: o.id })}>
                  <Text style={textStyles.body}>{o.name}</Text>
                  <Text style={textStyles.muted}>{[o.type, o.city].filter(Boolean).join(' · ') || 'Community'}</Text>
                </TouchableOpacity>
                {pending ? (
                  <Text style={st.pending}>Requested</Text>
                ) : (
                  <Text style={busy === o.id ? st.muted : st.link} onPress={() => busy ? undefined : request(o.id)}>
                    {busy === o.id ? 'Sending…' : 'Request to join'}
                  </Text>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  link: { color: theme.colors.primary, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontWeight: '700' },
  pending: { color: theme.colors.accent, fontWeight: '700', fontSize: theme.font.small },
});
