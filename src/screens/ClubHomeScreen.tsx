/** The team dashboard (spec §12): one place that shows the whole team and lets an
 *  admin drill in. Header with member / admin / sport counts, the SPORTS the team
 *  plays (tap a sport → its sport profile; admins can add/remove sports), and the
 *  MEMBERS with their team-level role (admin | member). Team administration lives
 *  here; sport-specific leadership (captains) lives inside each sport's profile. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, LoadingState, textStyles } from '../components/ui';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import {
  getClub, getClubMembers, getClubSports, getMyPlayerId, getPlayers,
  addClubSport, removeClubSport, addClubMember, removeClubMember, setClubMemberRole, invitePerson, createClubInvite, updateClub,
} from '../data/repos';
import { LogoPicker } from '../components/LogoPicker';
import QRCode from 'react-native-qrcode-svg';
import { clubInviteMessage, clubJoinDeepLink } from '../core/invite';
import type { Club, ClubMemberView, Player, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ClubHomeScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ClubHome'>>();
  const clubId = params.clubId;
  const { profile } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMemberView[]>([]);
  const [sports, setSports] = useState<SportId[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [editSports, setEditSports] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [addMode, setAddMode] = useState<'search' | 'phone'>('search');
  const [query, setQuery] = useState('');
  const [mName, setMName] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, m, s, id, ps] = await Promise.all([
      getClub(clubId), getClubMembers(clubId), getClubSports(clubId), getMyPlayerId(profile?.id), getPlayers(),
    ]);
    setClub(c); setMembers(m); setSports(s); setMyId(id); setAllPlayers(ps); setLoading(false);
  }, [clubId, profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const amAdmin = members.some((m) => m.playerId === myId && m.role === 'admin') || (!!club && club.createdBy === profile?.id);
  const adminCount = members.filter((m) => m.role === 'admin').length;

  async function toggleSport(s: SportId) {
    setBusy(true);
    try {
      if (sports.includes(s)) await removeClubSport(clubId, s);
      else await addClubSport(clubId, s);
      await load();
    } finally { setBusy(false); }
  }

  async function addByPhone() {
    if (!mName.trim()) return;
    setBusy(true);
    try {
      const { player } = await invitePerson({ name: mName.trim(), phone: mPhone.trim() || undefined });
      await addClubMember(clubId, player.id);
      setMName(''); setMPhone(''); setAddingMember(false);
      await load();
    } finally { setBusy(false); }
  }

  async function addExisting(playerId: string) {
    setBusy(true);
    try { await addClubMember(clubId, playerId); setQuery(''); await load(); }
    finally { setBusy(false); }
  }

  // Existing players not already in the club, matched by name / phone.
  const memberIds = new Set(members.map((m) => m.playerId));
  const q = query.trim().toLowerCase();
  const searchResults = q.length < 2 ? [] : allPlayers
    .filter((p) => !memberIds.has(p.id) && (p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q)))
    .slice(0, 8);

  async function removeMember(playerId: string) {
    setBusy(true);
    try { await removeClubMember(clubId, playerId); setConfirmRemove(null); await load(); }
    finally { setBusy(false); }
  }

  async function invite() {
    if (!club) return;
    setBusy(true);
    try {
      const inv = await createClubInvite(clubId);
      setInviteCode(inv.token);
      const message = clubInviteMessage({ clubName: club.name, inviterName: profile?.fullName ?? 'A teammate', token: inv.token });
      try { await Share.share({ message }); } catch { /* user dismissed the share sheet */ }
    } finally { setBusy(false); }
  }

  async function setRole(playerId: string, role: 'admin' | 'member') {
    // Guard against demoting the last admin — a team must keep at least one.
    if (role === 'member' && adminCount <= 1) return;
    setBusy(true);
    try { await setClubMemberRole(clubId, playerId, role); await load(); }
    finally { setBusy(false); }
  }

  if (loading) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;
  if (!club) return <SafeAreaView style={st.safe}><ScreenTitle title="Team not found" /></SafeAreaView>;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        {/* Header */}
        <Card style={st.header}>
          {club.logoUrl || amAdmin ? (
            <LogoPicker
              logoUrl={club.logoUrl}
              canManage={amAdmin}
              size={56}
              placeholder={club.shortName?.slice(0, 3) || '🛡️'}
              label="Add logo"
              onPick={async (uri) => { await updateClub(clubId, { logoUrl: uri }); setClub((c) => (c ? { ...c, logoUrl: uri } : c)); }}
            />
          ) : (
            <View style={[st.badge, { backgroundColor: club.colorHex ?? theme.colors.primary }]}>
              <Text style={st.badgeText}>{club.shortName?.slice(0, 3) || club.name.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h2}>{club.name}</Text>
            {!!club.city && <Text style={textStyles.muted}>{club.city}</Text>}
            <Text style={[textStyles.muted, { marginTop: theme.spacing(1) }]}>
              {members.length} member{members.length === 1 ? '' : 's'} · {adminCount} admin{adminCount === 1 ? '' : 's'} · {sports.length} sport{sports.length === 1 ? '' : 's'}
            </Text>
          </View>
        </Card>

        {/* Sports */}
        <View style={st.sectionHead}>
          <Text style={textStyles.h3}>Sports</Text>
          {amAdmin && (
            <TouchableOpacity onPress={() => setEditSports((v) => !v)} accessibilityRole="button">
              <Text style={st.link}>{editSports ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {editSports ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.muted}>Tap to add or remove a sport this team plays.</Text>
            <View style={st.chips}>
              {SPORT_LIST.map((s) => (
                <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sports.includes(s.id)} disabled={busy} onPress={() => toggleSport(s.id)} />
              ))}
            </View>
          </Card>
        ) : sports.length === 0 ? (
          <Card><Text style={textStyles.muted}>No sports yet. {amAdmin ? 'Tap Edit to add one.' : ''}</Text></Card>
        ) : (
          sports.map((s) => {
            const plugin = getSport(s);
            return (
              <TouchableOpacity key={s} accessibilityRole="button" accessibilityLabel={`Open ${plugin.name}`}
                onPress={() => nav.navigate('ClubSport', { clubId, sport: s })}>
                <Card style={st.sportRow}>
                  <Text style={st.sportIcon}>{plugin.icon}</Text>
                  <Text style={[textStyles.body, { flex: 1 }]}>{plugin.name}</Text>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {/* Members */}
        <View style={st.sectionHead}>
          <Text style={textStyles.h3}>Members</Text>
          {amAdmin && (
            <View style={st.memberActions}>
              <TouchableOpacity onPress={invite} accessibilityRole="button" disabled={busy}>
                <Text style={st.link}>🔗 Invite</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddingMember((v) => !v)} accessibilityRole="button">
                <Text style={st.link}>{addingMember ? 'Close' : '+ Add'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {inviteCode && (
          <Card style={{ gap: theme.spacing(2), alignItems: 'center' }}>
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>Scan to join, or share the code below.</Text>
            <View style={st.qrBox}>
              <QRCode value={clubJoinDeepLink(inviteCode)} size={168} backgroundColor="#ffffff" color="#04150F" />
            </View>
            <Text style={st.code}>{inviteCode}</Text>
            <Text style={[textStyles.muted, { textAlign: 'center', fontSize: theme.font.small }]}>They install SportnNote, open “Join a team”, and enter this code.</Text>
            <View style={st.memberActions}>
              <TouchableOpacity onPress={invite} accessibilityRole="button"><Text style={st.link}>🔗 Share link</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setInviteCode(null)} accessibilityRole="button"><Text style={textStyles.muted}>Hide</Text></TouchableOpacity>
            </View>
          </Card>
        )}

        {addingMember && (
          <Card style={{ gap: theme.spacing(2) }}>
            <View style={st.chips}>
              <SelectChip label="Search existing" active={addMode === 'search'} onPress={() => setAddMode('search')} />
              <SelectChip label="New by phone" active={addMode === 'phone'} onPress={() => setAddMode('phone')} />
            </View>
            {addMode === 'search' ? (
              <>
                <TextField label="Find a player" value={query} onChange={setQuery} placeholder="Name or phone" autoCapitalize="none" />
                {q.length >= 2 && searchResults.length === 0 && (
                  <Text style={textStyles.muted}>No matches. Try “New by phone” to invite someone not on the app.</Text>
                )}
                {searchResults.map((p) => (
                  <TouchableOpacity key={p.id} disabled={busy} onPress={() => addExisting(p.id)} accessibilityRole="button" style={st.resultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{p.fullName}</Text>
                      {!!p.phone && <Text style={textStyles.muted}>{p.phone}</Text>}
                    </View>
                    <Text style={st.link}>Add</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <TextField label="Name" value={mName} onChange={setMName} placeholder="Player name" />
                <TextField label="Phone (optional)" value={mPhone} onChange={setMPhone} placeholder="+91…" autoCapitalize="none" />
                <Button label={busy ? 'Adding…' : 'Add & invite'} onPress={addByPhone} />
              </>
            )}
          </Card>
        )}

        {members.length === 0 && !addingMember && (
          <Card><Text style={textStyles.muted}>No members yet.{amAdmin ? ' Add your teammates above.' : ''}</Text></Card>
        )}

        {members.map((m) => (
          <Card key={m.playerId} style={st.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={textStyles.body}>{m.player.fullName}{m.playerId === myId ? ' (you)' : ''}</Text>
              {!!m.player.invited && <Text style={st.pending}>Invite pending</Text>}
            </View>
            <View style={[st.roleTag, m.role === 'admin' && st.roleTagAdmin]}>
              <Text style={[st.roleText, m.role === 'admin' && st.roleTextAdmin]}>{m.role === 'admin' ? 'Admin' : 'Member'}</Text>
            </View>
            {amAdmin && (
              confirmRemove === m.playerId ? (
                <View style={st.confirmRow}>
                  <TouchableOpacity onPress={() => removeMember(m.playerId)} accessibilityRole="button"><Text style={st.danger}>Remove</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmRemove(null)} accessibilityRole="button"><Text style={st.link}>Cancel</Text></TouchableOpacity>
                </View>
              ) : (
                <View style={st.memberActions}>
                  <TouchableOpacity onPress={() => setRole(m.playerId, m.role === 'admin' ? 'member' : 'admin')} accessibilityRole="button">
                    <Text style={st.link}>{m.role === 'admin' ? 'Demote' : 'Make admin'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmRemove(m.playerId)} accessibilityRole="button"><Text style={st.danger}>✕</Text></TouchableOpacity>
                </View>
              )
            )}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  badge: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing(1) },
  link: { color: theme.colors.primary, fontWeight: '700' },
  danger: { color: '#FF5C5C', fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  sportIcon: { fontSize: 22 },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  pending: { color: '#FFB454', fontSize: theme.font.small, fontWeight: '600' },
  code: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.h3, letterSpacing: 1 },
  qrBox: { backgroundColor: '#ffffff', padding: theme.spacing(3), borderRadius: theme.radius.md },
  roleTag: { paddingHorizontal: theme.spacing(2), paddingVertical: 2, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt },
  roleTagAdmin: { backgroundColor: theme.colors.primary },
  roleText: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.textMuted },
  roleTextAdmin: { color: '#04150F' },
});
