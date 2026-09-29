/** Organization profile: identity, contact, members, teams and hosted events.
 *  Capabilities are role-based (see OrgRole):
 *   - Admin: edit every detail, manage members & their roles, create teams and
 *     rosters, and organize events.
 *   - Organizer: organize events (create & schedule tournaments/matches).
 *   - Scorer / Member: view only.
 *  Reached from a user's profile or a tournament's host. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Button, Card, Pill, SelectChip, TextField, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { LogoPicker } from '../components/LogoPicker';
import { DateField } from '../components/DateTimeField';
import { getSport, SPORT_LIST } from '../sports/registry';
import { useAuth } from '../core/auth';
import { usePlayers } from '../data/hooks';
import {
  getOrganization, getMyPlayerId, setOrgMembers, setOrgLogo, getTournaments, joinOrg,
  updateOrganization, getTeamsForOrg, createTeam, setTeamRoster,
  getOrgRequests, respondToOrgRequest, cancelOrgRequest, setOrgHouses,
} from '../data/repos';
import {
  ORG_ROLES, ORG_ROLE_BLURB, COMMUNITY_TYPES, canManageOrg, canOrganizeEvents, membershipPeriod,
  isAcademicCommunity, currentStandard, gradePeriod, promoteGrade, nextStandard,
  graduatingStandardOf, isGraduatingStandard, memberEntry, isSoleActiveAdmin, isSoleActiveOwner, canManageOwners, activeOwners,
  currentAcademicYear, firstAcademicYear, latestAcademicYear, nextAcademicYearDates,
  academicYearEnded, academicYearLabel, academicYearsOf,
  housesOf, currentHouse, assignHouse, houseColorOf,
} from '../core/org';
import { notify } from '../core/notifications';
import type { Organization, OrgMember, OrgRole, OrgRequest, House, Tournament, Team, Player, SportId, AcademicYear } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TEAM_COLORS = ['#FF5C5C', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#14B8A6'];

// Orgs already nudged about a finished academic year this session (avoid spam).
const notifiedYearEnd = new Set<string>();

export default function OrganizationScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Organization'>>();
  const { profile } = useAuth();
  const players = usePlayers();
  const [org, setOrg] = useState<Organization | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [events, setEvents] = useState<Tournament[]>([]);
  const [requests, setRequests] = useState<OrgRequest[]>([]); // pending join-requests + invites
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState<OrgRole>('Member');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingGrades, setEditingGrades] = useState<string | null>(null);
  const [editing, setEditing] = useState(false); // editing community details
  const [joinStandard, setJoinStandard] = useState(''); // class for a new student
  const [rolling, setRolling] = useState(false); // year-rollover panel open
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<'details' | 'events' | 'teams' | 'members'>('details');
  const [showCurrentEvents, setShowCurrentEvents] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [expandedRoleSections, setExpandedRoleSections] = useState<Record<string, boolean>>({});
  const [showPastMembers, setShowPastMembers] = useState(false);
  const [editingHouse, setEditingHouse] = useState<string | null>(null); // member whose House picker is open
  const [housesOpen, setHousesOpen] = useState(false); // the school's House-list editor
  const [newHouse, setNewHouse] = useState('');

  const loadOrg = useCallback(() => {
    getOrganization(params.orgId).then((o) => setOrg(o));
  }, [params.orgId]);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getOrganization(params.orgId).then((o) => on && setOrg(o));
      getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
      // Tournaments this community hosts — the basis of its event hierarchy.
      getTournaments().then((ts) => on && setEvents(ts.filter((t) => t.hostOrgId === params.orgId)));
      getOrgRequests(params.orgId, 'pending').then((rs) => on && setRequests(rs));
      return () => {
        on = false;
      };
    }, [params.orgId, profile?.id])
  );

  // Current = ongoing/upcoming (soonest first); past = finished, grouped by year.
  const currentEvents = useMemo(() => {
    const d = new Date().toISOString().slice(0, 10);
    return events.filter((t) => (t.endDate || '') >= d).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [events]);
  const pastEventsByYear = useMemo(() => {
    const d = new Date().toISOString().slice(0, 10);
    const map = new Map<string, Tournament[]>();
    for (const t of events.filter((t) => (t.endDate || '') < d)) {
      const yr = (t.startDate || '').slice(0, 4) || '—';
      (map.get(yr) ?? map.set(yr, []).get(yr)!).push(t);
    }
    return [...map.entries()]
      .map(([yr, list]) => [yr, list.sort((a, b) => b.startDate.localeCompare(a.startDate))] as const)
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.fullName ?? 'Player';
  const canManage = canManageOrg(org ?? undefined, myId); // Admin
  const canOrganize = canOrganizeEvents(org ?? undefined, myId); // Admin or Organizer
  const academic = isAcademicCommunity(org?.type); // school/college → class timelines
  const today = new Date().toISOString().slice(0, 10);
  // The academic year running today (drives "current year", rollover date, etc.).
  const curAY = currentAcademicYear(org ?? undefined, today);
  // The running year is over and the next one isn't set up yet → prompt admins.
  const yearEnded = academic && academicYearEnded(org ?? undefined, today);
  const nextAY = nextAcademicYearDates(org ?? undefined);
  // Rollover nudge: within the current academic year, how many active students
  // still sit in a class started before this year began (await promotion).
  const rolloverDue = useMemo(() => {
    if (!org || !academic || !curAY) return 0;
    return org.members.filter((m) => {
      if (m.until || !currentStandard(m)) return false;
      const open = (m.grades ?? []).find((g) => !g.until);
      return !!open && open.since < curAY.start;
    }).length;
  }, [org, academic, curAY]);
  // A student (active member who can't manage grades) can ask an admin/organizer
  // to fix their class. The admins & organizers who'd action it:
  const myMember = org && myId ? memberEntry(org, myId) : undefined;
  const canRequestClass = academic && !!myMember && !myMember.until && !canOrganize;
  const gradeApprovers = org ? org.members.filter((m) => !m.until && (m.role === 'Owner' || m.role === 'Admin' || m.role === 'Organizer')).map((m) => m.playerId) : [];
  const amOwner = canManageOwners(org ?? undefined, myId);
  // When an org somehow has no owner (legacy data), any manager may appoint the
  // first one — otherwise ownership could never be bootstrapped.
  const hasOwner = activeOwners(org ?? undefined).length > 0;
  const canGrantOwner = amOwner || !hasOwner;
  // Only players who aren't *active* members can be added (past members can rejoin).
  const addable = useMemo(
    () => (org ? players.filter((p) => !org.members.some((m) => m.playerId === p.id && !m.until)) : []),
    [org, players]
  );

  const save = (members: Organization['members']) => {
    if (!org) return;
    setOrg({ ...org, members });
    void setOrgMembers(org.id, members);
  };
  // Adding goes through joinOrg so the one-active-community-per-category rule is
  // enforced; then we re-read the org to reflect the change.
  const addMember = async (playerId: string) => {
    if (!org) return;
    setActionError(null);
    try {
      await joinOrg(org.id, playerId, role);
    } catch (e) {
      // e.g. the player is the sole admin of another community of this category.
      setActionError(e instanceof Error ? e.message : 'Could not add member.');
      return;
    }
    let fresh = await getOrganization(org.id);
    // For a school/college, record the class the student joined in.
    const std = joinStandard.trim();
    if (fresh && academic && std) {
      const m = fresh.members.find((x) => x.playerId === playerId);
      const since = m?.since ?? new Date().toISOString().slice(0, 10);
      const members = fresh.members.map((x) =>
        x.playerId === playerId ? { ...x, grades: promoteGrade(x.grades, std, since) } : x
      );
      await setOrgMembers(org.id, members);
      fresh = { ...fresh, members };
    }
    if (fresh) setOrg(fresh);
    setAdding(false);
    setJoinStandard('');
  };
  const setMemberGrades = (playerId: string, grades: OrgMember['grades']) => {
    if (!org) return;
    save(org.members.map((m) => (m.playerId === playerId ? { ...m, grades } : m)));
  };
  // Assign a student to a House (timeline-preserving; today's date opens a new stint).
  const setMemberHouse = (playerId: string, house: string) => {
    if (!org) return;
    save(org.members.map((m) => (m.playerId === playerId ? { ...m, houses: assignHouse(m.houses, house, today) } : m)));
    setEditingHouse(null);
  };
  // The school's House list (define/remove Houses).
  const saveHouses = (houses: House[]) => {
    if (!org) return;
    setOrg({ ...org, houses });
    void setOrgHouses(org.id, houses);
  };
  const addHouse = () => {
    const name = newHouse.trim();
    if (!org || !name || housesOf(org).some((h) => h.name.toLowerCase() === name.toLowerCase())) { setNewHouse(''); return; }
    const palette = ['#FF5C5C', '#4DA3FF', '#3DDC97', '#FFB454', '#B98AFF', '#FF8AC4'];
    saveHouses([...housesOf(org), { name, colorHex: palette[housesOf(org).length % palette.length] }]);
    setNewHouse('');
  };
  const removeHouse = (name: string) => { if (org) saveHouses(housesOf(org).filter((h) => h.name !== name)); };
  const setMemberRole = (playerId: string, newRole: OrgRole) => {
    if (!org) return;
    const target = org.members.find((m) => m.playerId === playerId);
    const targetIsOwner = !!target && !target.until && target.role === 'Owner';
    // Only Owners may touch Owners or grant Owner — except bootstrapping the first
    // Owner when the org has none.
    if ((targetIsOwner || newRole === 'Owner') && !canGrantOwner) {
      setActionError('Only owners can add, remove or change owners.');
      return;
    }
    // An org must always keep at least one owner.
    if (targetIsOwner && newRole !== 'Owner' && isSoleActiveOwner(org, playerId)) {
      setActionError('This is the only owner — make someone else an owner first.');
      return;
    }
    setActionError(null);
    save(org.members.map((m) => (m.playerId === playerId ? { ...m, role: newRole } : m)));
    setEditingRole(null);
  };
  const removeMember = (playerId: string) => {
    if (!org) return;
    const target = org.members.find((m) => m.playerId === playerId);
    const targetIsOwner = !!target && !target.until && target.role === 'Owner';
    if (targetIsOwner && !amOwner) {
      setActionError('Only owners can remove an owner.');
      return;
    }
    if (isSoleActiveOwner(org, playerId)) {
      setActionError('This is the only owner — make someone else an owner before removing them.');
      return;
    }
    setActionError(null);
    save(org.members.filter((x) => x.playerId !== playerId));
  };
  // Accept / decline a pending join-request or invite.
  const decideRequest = async (req: OrgRequest, accept: boolean) => {
    setActionError(null);
    try {
      await respondToOrgRequest(req.id, accept, myId ?? undefined);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update the request.');
      return;
    }
    const [fresh, reqs] = await Promise.all([getOrganization(params.orgId), getOrgRequests(params.orgId, 'pending')]);
    if (fresh) setOrg(fresh);
    setRequests(reqs);
  };
  const withdrawRequest = async (req: OrgRequest) => {
    await cancelOrgRequest(req.id);
    setRequests(await getOrgRequests(params.orgId, 'pending'));
  };
  const saveLogo = (uri: string) => {
    if (!org) return;
    setOrg({ ...org, logoUrl: uri });
    void setOrgLogo(org.id, uri);
  };
  const addAcademicYear = (ay: AcademicYear) => {
    if (!org) return;
    const years = [...(org.academicYears ?? []), ay];
    setOrg({ ...org, academicYears: years });
    void updateOrganization(org.id, { academicYears: years });
  };

  // When the running year has ended with no new one set up, notify admins once.
  useEffect(() => {
    if (!org || !yearEnded || !canManage || notifiedYearEnd.has(org.id)) return;
    notifiedYearEnd.add(org.id);
    const last = latestAcademicYear(org);
    void notify({
      title: `📅 New academic year — ${org.name}`,
      body: `The ${last?.label} year ended on ${last?.end}. Set up ${nextAY?.label ?? 'the new academic year'} to begin promotions.`,
    });
  }, [org, yearEnded, canManage, nextAY]);

  if (!org) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const renderEvent = (t: Tournament) => (
    <TouchableOpacity accessibilityRole="button" key={t.id} activeOpacity={0.85} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>
      <Card style={st.eventRow}>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.body} numberOfLines={1}>{t.name}</Text>
          <Text style={textStyles.muted}>{t.sports.map((s) => getSport(s).icon).join(' ')} · {t.startDate} → {t.endDate}</Text>
        </View>
        <Text style={st.chevron}>›</Text>
      </Card>
    </TouchableOpacity>
  );

  const renderMember = (m: OrgMember) => (
    <View key={m.playerId} style={{ gap: theme.spacing(2) }}>
      <Card style={[st.memberRow, m.until && st.pastMember]}>
        <Text style={st.memberIcon}>🧑‍💼</Text>
        <TouchableOpacity accessibilityRole="button" style={{ flex: 1 }} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: m.playerId })}>
          <Text style={textStyles.body} numberOfLines={1}>{nameOf(m.playerId)}</Text>
          {(m.until || m.since) ? (
            <Text style={textStyles.muted}>{m.until ? '⏳ Past member' : 'Member'} · {membershipPeriod(m)}</Text>
          ) : null}
          {academic && currentStandard(m) ? (
            <Text style={st.standardLine}>🎓 {currentStandard(m)}{currentHouse(m) ? `  ·  🏠 ${currentHouse(m)}` : ''}</Text>
          ) : academic && currentHouse(m) ? (
            <Text style={st.standardLine}>🏠 {currentHouse(m)}</Text>
          ) : null}
          {academic && !m.until && (m.role === 'Owner' || m.role === 'Admin') && currentStandard(m) ? (
            <Text style={st.warn}>⚠ Student {m.role.toLowerCase()} — usually a staff role</Text>
          ) : null}
        </TouchableOpacity>
        {canManage ? (
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => setEditingRole((v) => (v === m.playerId ? null : m.playerId))}>
            <Pill label={`${m.role} ▾`} color={theme.colors.surfaceAlt} textColor={m.role === 'Owner' ? theme.colors.primary : m.role === 'Admin' ? theme.colors.accent : theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <Pill label={m.role} color={theme.colors.surfaceAlt} textColor={m.role === 'Owner' ? theme.colors.primary : m.role === 'Admin' ? theme.colors.accent : theme.colors.textMuted} />
        )}
        {canManage && (org.members.length > 1) && (
          isSoleActiveOwner(org, m.playerId)
            ? <Text style={st.onlyAdmin}>Only owner</Text>
            : <Text style={st.remove} onPress={() => removeMember(m.playerId)}>Remove</Text>
        )}
      </Card>
      {canManage && editingRole === m.playerId && (
        <View style={{ gap: theme.spacing(1) }}>
          <View style={st.chips}>
            {ORG_ROLES.map((r) => (
              <SelectChip
                key={r}
                label={r}
                active={m.role === r}
                disabled={
                  (isSoleActiveOwner(org, m.playerId) && r !== 'Owner') ||   // can't demote the last owner
                  ((r === 'Owner' || m.role === 'Owner') && !canGrantOwner)  // only owners manage owners (unless bootstrapping the first)
                }
                onPress={() => setMemberRole(m.playerId, r)}
              />
            ))}
          </View>
          <Text style={st.roleBlurb}>{ORG_ROLE_BLURB[m.role]}</Text>
          {m.role === 'Owner' && !canGrantOwner ? (
            <Text style={st.warn}>Only owners can change an owner's role.</Text>
          ) : null}
          {isSoleActiveOwner(org, m.playerId) ? (
            <Text style={st.warn}>This is the community's only owner — make someone else an owner before changing this role.</Text>
          ) : null}
          {currentStandard(m) ? (
            <Text style={st.warn}>⚠ {nameOf(m.playerId)} is a student ({currentStandard(m)}). Admin is normally a staff/management role; their rights are revoked automatically on graduation.</Text>
          ) : null}
        </View>
      )}
      {academic && canOrganize && !m.until && (
        <Text style={st.classLink} onPress={() => setEditingGrades((v) => (v === m.playerId ? null : m.playerId))}>
          {editingGrades === m.playerId ? 'Close class timeline' : '🎓 Class timeline'}
        </Text>
      )}
      {academic && canOrganize && editingGrades === m.playerId && (
        <GradeEditor member={m} onSave={(grades) => setMemberGrades(m.playerId, grades)} />
      )}
      {academic && canManage && !m.until && housesOf(org).length > 0 && (
        <Text style={st.classLink} onPress={() => setEditingHouse((v) => (v === m.playerId ? null : m.playerId))}>
          {currentHouse(m) ? `🏠 ${currentHouse(m)}` : '🏠 Assign House'} {editingHouse === m.playerId ? '▲' : '▾'}
        </Text>
      )}
      {academic && canManage && editingHouse === m.playerId && (
        <View style={st.chips}>
          {housesOf(org).map((h) => (
            <SelectChip key={h.name} label={h.name} dotColor={h.colorHex} active={currentHouse(m) === h.name} onPress={() => setMemberHouse(m.playerId, h.name)} />
          ))}
        </View>
      )}
    </View>
  );

  // Members grouped by role (active), plus a past-members (alumni) section.
  const active = org.members.filter((m) => !m.until);
  const past = org.members.filter((m) => m.until);
  const ROLE_SECTIONS: { role: OrgRole; label: string }[] = [
    { role: 'Owner', label: 'Owners' },
    { role: 'Admin', label: 'Admins' },
    { role: 'Organizer', label: 'Organizers' },
    { role: 'Scorer', label: 'Scorers' },
    { role: 'Referee', label: 'Referees' },
    { role: 'Member', label: academic ? 'Students & members' : 'Members' },
  ];

  const TABS = [
    ['details', 'Details'],
    ['events', 'Events'],
    ['teams', 'Teams'],
    ['members', 'Members'],
  ] as const;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <View style={st.header}>
        <LogoPicker logoUrl={org.logoUrl} canManage={canManage} onPick={saveLogo} size={60} placeholder="🏛️" />
        <View style={{ flex: 1 }}>
          <ScreenTitle title={org.name} subtitle={[org.type, org.city ? `📍 ${org.city}` : ''].filter(Boolean).join(' · ') || 'Community'} />
        </View>
      </View>
      <View style={st.tabs}>
        {TABS.map(([k, label]) => (
          <SelectChip key={k} label={label} active={tab === k} onPress={() => setTab(k)} />
        ))}
      </View>

      <ScrollView contentContainerStyle={st.content}>
        {/* ───────────────────────── Details ───────────────────────── */}
        {tab === 'details' && (
          canManage && editing ? (
            <DetailsEditor
              org={org}
              onCancel={() => setEditing(false)}
              onSaved={() => { setEditing(false); loadOrg(); }}
            />
          ) : (
            <>
              {canManage && (
                <Text style={[st.link, { alignSelf: 'flex-end' }]} onPress={() => setEditing(true)}>✎ Edit</Text>
              )}
              {org.bio ? <Text style={textStyles.muted}>{org.bio}</Text> : null}
              {(org.email || org.phone) && (
                <Card style={{ gap: theme.spacing(1) }}>
                  <Text style={textStyles.muted}>Contact</Text>
                  {org.phone ? <Text style={textStyles.body}>📞 {org.phone}</Text> : null}
                  {org.email ? <Text style={textStyles.body}>✉️ {org.email}</Text> : null}
                </Card>
              )}
              {academic && (
                <Card style={{ gap: theme.spacing(1) }}>
                  <Text style={textStyles.muted}>Academic</Text>
                  {firstAcademicYear(org) ? (
                    <Text style={textStyles.muted}>📅 Organizing here since {firstAcademicYear(org)!.start.slice(0, 4)}</Text>
                  ) : null}
                  <Text style={textStyles.body}>
                    🎓 Current year: {curAY ? `${curAY.label} (${curAY.start} → ${curAY.end})` : 'not set'}
                  </Text>
                  <Text style={textStyles.muted}>Graduating class: {graduatingStandardOf(org) ?? '—'}</Text>
                  {yearEnded ? (
                    <Text style={st.warnStrong}>📅 {latestAcademicYear(org)?.label} ended on {latestAcademicYear(org)?.end} — set up the new academic year.</Text>
                  ) : null}
                </Card>
              )}
              {!org.bio && !org.email && !org.phone && !academic ? (
                <Text style={textStyles.muted}>No details yet.</Text>
              ) : null}
            </>
          )
        )}

        {/* ───────────────────────── Events ───────────────────────── */}
        {tab === 'events' && (
          <>
            {canOrganize && (
              <Text style={[st.link, { alignSelf: 'flex-end' }]} onPress={() => nav.navigate('CreateTournament', { orgId: org.id })}>+ Organize event</Text>
            )}
            {academic && (firstAcademicYear(org) || curAY) ? (
              <Text style={textStyles.muted}>
                {firstAcademicYear(org) ? `📅 Organizing since ${firstAcademicYear(org)!.start.slice(0, 4)}` : ''}
                {curAY ? `  ·  Academic year ${curAY.label}` : yearEnded ? '  ·  Between academic years' : ''}
              </Text>
            ) : null}
            <SectionHeader
              title="Current"
              count={currentEvents.length}
              onSeeAll={currentEvents.length > SECTION_CAP ? () => setShowCurrentEvents((v) => !v) : undefined}
              expanded={showCurrentEvents}
            />
            {currentEvents.length === 0 ? (
              <EmptyState icon="📅" title="No ongoing or upcoming events" compact />
            ) : (
              (showCurrentEvents ? currentEvents : currentEvents.slice(0, SECTION_CAP)).map(renderEvent)
            )}
            <SectionHeader
              title="Past"
              count={pastEventsByYear.reduce((n, [, list]) => n + list.length, 0)}
              onSeeAll={pastEventsByYear.some(([, list]) => list.length > SECTION_CAP) ? () => setShowPastEvents((v) => !v) : undefined}
              expanded={showPastEvents}
            />
            {pastEventsByYear.length === 0 ? (
              <EmptyState icon="📅" title="No past events" compact />
            ) : (
              pastEventsByYear.map(([year, list]) => (
                <View key={year} style={{ gap: theme.spacing(2) }}>
                  <Text style={st.year}>{year}</Text>
                  {(showPastEvents ? list : list.slice(0, SECTION_CAP)).map(renderEvent)}
                </View>
              ))
            )}
          </>
        )}

        {/* ───────────────────────── Teams ───────────────────────── */}
        {tab === 'teams' && (
          <OrgTeams orgId={org.id} canEdit={canOrganize} players={players} nameOf={nameOf} />
        )}

        {/* ───────────────────────── Members ───────────────────────── */}
        {tab === 'members' && (
          <>
            <View style={st.headLinks}>
              {academic && canOrganize && (
                <Text style={st.link} onPress={() => setRolling((v) => !v)}>{rolling ? 'Close' : '🎓 Promote year'}</Text>
              )}
              {canManage && addable.length > 0 && (
                <Text style={st.link} onPress={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ Add member'}</Text>
              )}
            </View>
            {actionError ? (
              <Card style={st.errorCard}><Text style={st.warnStrong}>⚠ {actionError}</Text></Card>
            ) : null}

            {/* Pending membership requests & invites (managers act on them here). */}
            {canManage && requests.length > 0 && (() => {
              const joinReqs = requests.filter((r) => r.direction === 'request');
              const invites = requests.filter((r) => r.direction === 'invite');
              return (
                <Card style={{ gap: theme.spacing(2) }}>
                  {joinReqs.length > 0 && (
                    <>
                      <Text style={textStyles.h3}>Requests to join · {joinReqs.length}</Text>
                      {joinReqs.map((r) => (
                        <View key={r.id} style={st.reqRow}>
                          <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{nameOf(r.playerId)}</Text>
                          <Text style={st.link} onPress={() => void decideRequest(r, true)}>Accept</Text>
                          <Text style={st.remove} onPress={() => void decideRequest(r, false)}>Decline</Text>
                        </View>
                      ))}
                    </>
                  )}
                  {invites.length > 0 && (
                    <>
                      <Text style={textStyles.h3}>Invites sent · {invites.length}</Text>
                      {invites.map((r) => (
                        <View key={r.id} style={st.reqRow}>
                          <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{nameOf(r.playerId)} · {r.role}</Text>
                          <Text style={textStyles.muted}>awaiting reply</Text>
                          <Text style={st.remove} onPress={() => void withdrawRequest(r)}>Cancel</Text>
                        </View>
                      ))}
                    </>
                  )}
                </Card>
              );
            })()}

            {/* The running year ended — set up the new one (then promote). */}
            {academic && canManage && yearEnded && nextAY && (
              <Card style={st.nudge}>
                <Text style={textStyles.body}>📅 {latestAcademicYear(org)?.label} academic year has ended</Text>
                <Text style={textStyles.muted}>Set up {nextAY.label} ({nextAY.start} → {nextAY.end}) to begin a new year.</Text>
                <Button label={`Start ${nextAY.label}`} onPress={() => addAcademicYear(nextAY)} />
              </Card>
            )}

            {academic && canOrganize && curAY && rolloverDue > 0 && !rolling && (
              <Card style={st.nudge}>
                <Text style={textStyles.body}>🎓 {curAY.label} academic year started on {curAY.start}</Text>
                <Text style={textStyles.muted}>{rolloverDue} student{rolloverDue === 1 ? '' : 's'} await class rollover.</Text>
                <Button label="Promote students" onPress={() => setRolling(true)} />
              </Card>
            )}

            {academic && canOrganize && rolling && (
              <YearRollover
                org={org}
                nameOf={nameOf}
                onApply={(members) => { save(members); setRolling(false); }}
              />
            )}

            {canRequestClass && (
              <ClassRequest
                current={currentStandard(myMember)}
                onSend={(requested, note) => {
                  const myName = (myId && nameOf(myId)) || 'A student';
                  for (const pid of gradeApprovers) {
                    void notify({
                      title: `🎓 Class update request — ${org.name}`,
                      body: `${myName} requests their class be set to “${requested}”${note ? `. Note: ${note}` : ''}.`,
                      playerId: myId ?? undefined,
                    });
                  }
                }}
              />
            )}

            {canManage && adding && (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.muted}>Role for the new member</Text>
                <View style={st.chips}>
                  {ORG_ROLES.map((r) => (
                    <SelectChip key={r} label={r} active={role === r} onPress={() => setRole(r)} />
                  ))}
                </View>
                <Text style={st.roleBlurb}>{ORG_ROLE_BLURB[role]}</Text>
                {academic && (
                  <TextField
                    label="Joining class / standard (optional)"
                    value={joinStandard}
                    onChange={setJoinStandard}
                    placeholder="e.g. Grade 9"
                  />
                )}
                {academic && role === 'Admin' && joinStandard.trim() ? (
                  <Text style={st.warn}>⚠ Admins are usually staff/management — you're adding a student as admin.</Text>
                ) : null}
                <Text style={textStyles.muted}>Tap a player to add</Text>
                {addable.map((p) => (
                  <TouchableOpacity accessibilityRole="button" key={p.id} style={st.addRow} activeOpacity={0.8} onPress={() => void addMember(p.id)}>
                    <Text style={st.addText}>+ {p.fullName}</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}

            {/* Houses (schools): a managed list students are assigned to. */}
            {academic && canManage && (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={st.link} onPress={() => setHousesOpen((v) => !v)}>
                  🏠 Houses{housesOf(org).length ? ` · ${housesOf(org).length}` : ''} {housesOpen ? '▲' : '▼'}
                </Text>
                {housesOpen && (
                  <>
                    <Text style={textStyles.muted}>Define your school's Houses. Students are assigned to a House independently of their class or teams.</Text>
                    <View style={st.chips}>
                      {housesOf(org).map((h) => (
                        <View key={h.name} style={st.houseChip}>
                          <View style={[st.houseDot, { backgroundColor: h.colorHex ?? theme.colors.textMuted }]} />
                          <Text style={textStyles.body}>{h.name}</Text>
                          <Text style={st.remove} onPress={() => removeHouse(h.name)}> ✕</Text>
                        </View>
                      ))}
                    </View>
                    <View style={st.row}>
                      <View style={{ flex: 1 }}><TextField label="" value={newHouse} onChange={setNewHouse} placeholder="Add a House (e.g. Red House)" /></View>
                      <Button label="Add" onPress={addHouse} />
                    </View>
                  </>
                )}
              </Card>
            )}

            {ROLE_SECTIONS.map(({ role: r, label }) => {
              const list = active.filter((m) => m.role === r);
              if (list.length === 0) return null;
              const expanded = !!expandedRoleSections[r];
              return (
                <View key={r} style={{ gap: theme.spacing(2) }}>
                  <SectionHeader
                    title={`${label} · ${list.length}`}
                    count={list.length}
                    onSeeAll={list.length > SECTION_CAP ? () => setExpandedRoleSections((s) => ({ ...s, [r]: !s[r] })) : undefined}
                    expanded={expanded}
                  />
                  {(expanded ? list : list.slice(0, SECTION_CAP)).map(renderMember)}
                </View>
              );
            })}

            {past.length > 0 && (
              <View style={{ gap: theme.spacing(2) }}>
                <SectionHeader
                  title={`Past members · ${past.length}`}
                  count={past.length}
                  onSeeAll={past.length > SECTION_CAP ? () => setShowPastMembers((v) => !v) : undefined}
                  expanded={showPastMembers}
                />
                {(showPastMembers ? past : past.slice(0, SECTION_CAP)).map(renderMember)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A student's request to an admin/organizer to correct their class — a free-text
 *  requested class plus an optional note, sent as a notification. */
function ClassRequest({ current, onSend }: { current?: string; onSend: (requested: string, note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(current ?? '');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Card><Text style={textStyles.body}>✓ Request sent</Text><Text style={textStyles.muted}>An admin or organizer will review and update your class.</Text></Card>
    );
  }
  if (!open) {
    return <Text style={st.classLink} onPress={() => setOpen(true)}>🎓 Request a class update</Text>;
  }
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.body}>Request a class update</Text>
      <Text style={textStyles.muted}>Ask an admin or organizer to set your class — e.g. if you repeated a year.{current ? ` You're currently ${current}.` : ''}</Text>
      <TextField label="Your class should be" value={requested} onChange={setRequested} placeholder="e.g. Grade 9" autoCapitalize="words" />
      <TextField label="Note (optional)" value={note} onChange={setNote} placeholder="Add any context for the admin" multiline />
      <View style={st.formActions}>
        <Button label="Cancel" variant="ghost" style={st.flex} onPress={() => setOpen(false)} />
        <Button label="Send request" style={st.flex} disabled={!requested.trim()} onPress={() => { onSend(requested.trim(), note.trim()); setSent(true); }} />
      </View>
    </Card>
  );
}

/** Bulk year-rollover. Each current student is pre-filled with the next class up,
 *  except those in the graduating class who default to "Graduate" (they leave the
 *  school). Any one can be overridden: set the same class to repeat the year
 *  (e.g. a student who didn't clear Grade 10), clear it to skip, or — for a
 *  graduating student — turn off Graduate to instead promote/repeat them. The
 *  effective date defaults to this year's academic-year start. */
function YearRollover({
  org, nameOf, onApply,
}: {
  org: Organization;
  nameOf: (id: string) => string;
  onApply: (members: OrgMember[]) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const members = org.members;
  const students = useMemo(() => members.filter((m) => !m.until && currentStandard(m)), [members]);
  const gradStd = graduatingStandardOf(org);

  const [since, setSince] = useState(
    currentAcademicYear(org, today)?.start ?? nextAcademicYearDates(org)?.start ?? today
  );
  // Per-student target class, seeded with the next class up.
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((m) => [m.playerId, nextStandard(currentStandard(m)!)]))
  );
  // Whether a (graduating-class) student graduates. Defaults on for that class.
  const [grad, setGrad] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(students.map((m) => [m.playerId, isGraduatingStandard(org, currentStandard(m))]))
  );

  const eff = () => since.trim() || today;
  const actionOf = (m: OrgMember): 'graduate' | 'promote' | 'repeat' | 'skip' => {
    if (grad[m.playerId]) return 'graduate';
    const cur = currentStandard(m);
    const t = targets[m.playerId]?.trim();
    if (!t) return 'skip';
    return t === cur ? 'repeat' : 'promote';
  };

  // Pure preview of the resulting members, used by both apply and the safeguards.
  const transformed = (): OrgMember[] =>
    members.map((m) => {
      if (m.until || !currentStandard(m)) return m;
      const a = actionOf(m);
      if (a === 'graduate') {
        // Graduating students leave: close the open class, end membership, and
        // strip any Admin/Organizer rights they held (→ Member).
        const grades = (m.grades ?? []).map((g) => (!g.until ? { ...g, until: eff() } : g));
        const role: OrgRole = m.role === 'Admin' || m.role === 'Organizer' ? 'Member' : m.role;
        return { ...m, grades, until: eff(), role };
      }
      if (a === 'promote') return { ...m, grades: promoteGrade(m.grades, targets[m.playerId].trim(), eff()) };
      return m; // repeat / skip → unchanged
    });

  const apply = () => onApply(transformed());

  // Graduation revokes rights, so warn if it would leave the org with no admin.
  const noAdminAfter = !transformed().some((m) => !m.until && m.role === 'Admin');
  const revoked = students.filter((m) => actionOf(m) === 'graduate' && (m.role === 'Admin' || m.role === 'Organizer'));

  const counts = students.reduce(
    (acc, m) => { const a = actionOf(m); if (a === 'graduate') acc.grad++; else if (a === 'promote') acc.promo++; return acc; },
    { grad: 0, promo: 0 }
  );
  const total = counts.grad + counts.promo;
  const label = total === 0 ? 'Nothing to apply'
    : [counts.promo ? `Promote ${counts.promo}` : '', counts.grad ? `Graduate ${counts.grad}` : ''].filter(Boolean).join(' · ');

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>🎓 Promote year</Text>
      {students.length === 0 ? (
        <Text style={textStyles.muted}>No students with a class to promote.</Text>
      ) : (
        <>
          <Text style={textStyles.muted}>
            Each student moves up a class; those in {gradStd ?? 'the final class'} graduate. Override any one — repeat the same class, clear to skip, or turn off Graduate to keep a student on.
          </Text>
          <DateField label="Effective from" value={since} onChange={setSince} />
          {students.map((m) => {
            const cur = currentStandard(m)!;
            const a = actionOf(m);
            const isGrad = grad[m.playerId];
            return (
              <View key={m.playerId} style={{ gap: theme.spacing(1) }}>
                <View style={st.rollRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body} numberOfLines={1}>{nameOf(m.playerId)}</Text>
                    <Text style={textStyles.muted}>
                      {cur} → {a === 'graduate' ? '🎓 graduates' : a === 'skip' ? '(skip)' : a === 'repeat' ? 'repeat' : targets[m.playerId]}
                    </Text>
                    {a === 'graduate' && (m.role === 'Admin' || m.role === 'Organizer') ? (
                      <Text style={st.warn}>↳ revokes {m.role} rights</Text>
                    ) : null}
                  </View>
                  {!isGrad && (
                    <View style={st.rollTarget}>
                      <TextField label="" value={targets[m.playerId] ?? ''} onChange={(v) => setTargets((t) => ({ ...t, [m.playerId]: v }))} placeholder="—" autoCapitalize="words" />
                    </View>
                  )}
                </View>
                {isGraduatingStandard(org, cur) && (
                  <View style={st.chips}>
                    <SelectChip label="🎓 Graduate" active={isGrad} onPress={() => setGrad((g) => ({ ...g, [m.playerId]: true }))} />
                    <SelectChip label="Keep on" active={!isGrad} onPress={() => setGrad((g) => ({ ...g, [m.playerId]: false }))} />
                  </View>
                )}
              </View>
            );
          })}
          {revoked.length > 0 && (
            <Text style={st.warn}>
              Graduating revokes elevated rights from {revoked.map((m) => nameOf(m.playerId)).join(', ')}.
            </Text>
          )}
          {noAdminAfter && (
            <Text style={st.warnStrong}>⚠ This would leave the community with no admin. Appoint another admin (ideally staff), or keep one of these students on, before applying.</Text>
          )}
          <Button label={noAdminAfter ? 'Add an admin first' : label} onPress={apply} disabled={total === 0 || noAdminAfter} />
        </>
      )}
    </Card>
  );
}

/** Manage a student's class/standard timeline: show the history and record a
 *  promotion (a new class effective from a date, which closes the prior one). */
function GradeEditor({ member, onSave }: { member: OrgMember; onSave: (grades: OrgMember['grades']) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [standard, setStandard] = useState('');
  const [since, setSince] = useState(today);
  const grades = [...(member.grades ?? [])].sort((a, b) => a.since.localeCompare(b.since));

  const promote = () => {
    const std = standard.trim();
    if (!std) return;
    onSave(promoteGrade(member.grades, std, since.trim() || today));
    setStandard('');
  };
  const removeAt = (i: number) => {
    const next = grades.filter((_, j) => j !== i).map((g, j, arr) => (j === arr.length - 1 ? { ...g, until: undefined } : g));
    onSave(next.length ? next : undefined);
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>Class timeline</Text>
      {grades.length === 0 ? (
        <Text style={textStyles.muted}>No class recorded yet.</Text>
      ) : (
        grades.map((g, i) => (
          <View key={`${g.standard}-${g.since}`} style={st.gradeRow}>
            <Text style={[textStyles.body, { flex: 1 }]}>{g.standard}</Text>
            <Text style={textStyles.muted}>{gradePeriod(g)}{!g.until ? ' · current' : ''}</Text>
            <Text style={st.remove} onPress={() => removeAt(i)}>✕</Text>
          </View>
        ))
      )}
      <Text style={textStyles.muted}>Promote / set class</Text>
      <View style={st.row}>
        <View style={st.flex}><TextField label="Class" value={standard} onChange={setStandard} placeholder="e.g. Grade 10" /></View>
        <View style={st.flex}><DateField label="Effective from" value={since} onChange={setSince} /></View>
      </View>
      <Button label="Set class" onPress={promote} disabled={!standard.trim()} />
    </Card>
  );
}

/** Admin form for editing the community's name, category, city, contact & bio. */
function DetailsEditor({ org, onCancel, onSaved }: { org: Organization; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [type, setType] = useState(org.type ?? '');
  const [city, setCity] = useState(org.city ?? '');
  const [email, setEmail] = useState(org.email ?? '');
  const [phone, setPhone] = useState(org.phone ?? '');
  const [bio, setBio] = useState(org.bio ?? '');
  const [gradStd, setGradStd] = useState(org.graduatingStandard ?? (org.type === 'School' ? 'Grade 10' : ''));
  const [years, setYears] = useState<AcademicYear[]>(academicYearsOf(org));
  // New-year inputs, pre-filled from the next extrapolated year if available.
  const seed = nextAcademicYearDates({ ...org, academicYears: years });
  const [nyStart, setNyStart] = useState(seed?.start ?? '');
  const [nyEnd, setNyEnd] = useState(seed?.end ?? '');
  const [busy, setBusy] = useState(false);
  const academic = isAcademicCommunity(type);

  const addYear = () => {
    const s = nyStart.trim(), e = nyEnd.trim();
    if (!s || !e) return;
    setYears((ys) => [...ys, { start: s, end: e, label: academicYearLabel(s, e) }].sort((a, b) => a.start.localeCompare(b.start)));
    setNyStart(''); setNyEnd('');
  };
  const removeYear = (i: number) => setYears((ys) => ys.filter((_, j) => j !== i));

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await updateOrganization(org.id, {
      name: name.trim(),
      type: type.trim() || undefined,
      city: city.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      bio: bio.trim() || undefined,
      academicYears: academic ? (years.length ? years : undefined) : undefined,
      graduatingStandard: academic ? (gradStd.trim() || undefined) : undefined,
    });
    setBusy(false);
    onSaved();
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>Edit community</Text>
      <TextField label="Name" value={name} onChange={setName} />
      <Text style={textStyles.muted}>Category</Text>
      <View style={st.chips}>
        {COMMUNITY_TYPES.map((t) => (
          <SelectChip key={t} label={t} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      <TextField label="Category (custom)" value={type} onChange={setType} placeholder="e.g. Academy" />
      <TextField label="City" value={city} onChange={setCity} />
      <TextField label="Email" value={email} onChange={setEmail} autoCapitalize="none" />
      <TextField label="Phone" value={phone} onChange={setPhone} />
      <TextField label="Bio" value={bio} onChange={setBio} placeholder="What this community is about" />
      {academic && (
        <>
          <Text style={textStyles.h3}>Academic years</Text>
          <Text style={textStyles.muted}>Each year has real start &amp; end dates — the running one is detected from today's date and drives class rollover.</Text>
          {years.length === 0 ? (
            <Text style={textStyles.muted}>No academic years yet — add your first below.</Text>
          ) : (
            years.map((y, i) => (
              <View key={`${y.start}-${y.end}`} style={st.gradeRow}>
                <Text style={[textStyles.body, { flex: 1 }]}>{y.label}</Text>
                <Text style={textStyles.muted}>{y.start} → {y.end}</Text>
                <Text style={st.remove} onPress={() => removeYear(i)}>✕</Text>
              </View>
            ))
          )}
          <View style={st.row}>
            <View style={st.flex}><DateField label="Year starts" value={nyStart} onChange={setNyStart} /></View>
            <View style={st.flex}><DateField label="Year ends" value={nyEnd} onChange={setNyEnd} /></View>
          </View>
          <Button label="+ Add academic year" variant="ghost" onPress={addYear} disabled={!nyStart.trim() || !nyEnd.trim()} />
          <TextField label="Graduating class (students leave after this)" value={gradStd} onChange={setGradStd} placeholder="Grade 10" autoCapitalize="words" />
        </>
      )}
      <View style={st.formActions}>
        <Button label="Cancel" variant="ghost" style={st.flex} onPress={onCancel} disabled={busy} />
        <Button label={busy ? '…' : 'Save'} style={st.flex} onPress={() => void submit()} disabled={busy} />
      </View>
    </Card>
  );
}

/** Community teams: admins create them (name, sport, colour) and pick rosters. */
function OrgTeams({
  orgId, canEdit, players, nameOf,
}: {
  orgId: string;
  canEdit: boolean;
  players: Player[];
  nameOf: (id: string) => string;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingRoster, setEditingRoster] = useState<string | null>(null);
  const [showTeams, setShowTeams] = useState(false);

  const load = useCallback(() => { getTeamsForOrg(orgId).then(setTeams); }, [orgId]);
  useEffect(load, [load]);

  return (
    <>
      <View style={st.membersHead}>
        <Text style={textStyles.h3}>Teams</Text>
        {canEdit && (
          <Text style={st.link} onPress={() => setCreating((v) => !v)}>{creating ? 'Close' : '+ Create team'}</Text>
        )}
      </View>

      {canEdit && creating && (
        <NewTeamForm
          orgId={orgId}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}

      {teams.length === 0 ? (
        <EmptyState icon="🛡️" title="No teams yet" hint={canEdit ? 'Create one and pick its roster.' : undefined} compact />
      ) : (
        (showTeams ? teams : teams.slice(0, SECTION_CAP)).map((t) => (
          <View key={t.id} style={{ gap: theme.spacing(2) }}>
            <Card style={st.memberRow}>
              <View style={[st.swatch, { backgroundColor: t.colorHex ?? theme.colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>{t.name} · {t.shortName}</Text>
                <Text style={textStyles.muted}>{getSport(t.sport).icon} {getSport(t.sport).name} · {t.roster?.length ?? 0} players</Text>
              </View>
              {canEdit && (
                <Text style={st.link} onPress={() => setEditingRoster((v) => (v === t.id ? null : t.id))}>
                  {editingRoster === t.id ? 'Done' : 'Roster'}
                </Text>
              )}
            </Card>
            {!canEdit && t.roster?.length ? (
              <Text style={st.rosterNames}>{t.roster.map(nameOf).join(', ')}</Text>
            ) : null}
            {canEdit && editingRoster === t.id && (
              <RosterEditor
                team={t}
                players={players}
                onChanged={load}
              />
            )}
          </View>
        ))
      )}
      {teams.length > SECTION_CAP && (
        <Text style={st.link} onPress={() => setShowTeams((v) => !v)}>{showTeams ? 'Show less' : `See all (${teams.length}) ›`}</Text>
      )}
    </>
  );
}

function NewTeamForm({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [sport, setSport] = useState<SportId>('football');
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const autoShort = (n: string) =>
    n.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await createTeam({
      name: name.trim(),
      shortName: (shortName.trim() || autoShort(name)) || name.trim().slice(0, 3).toUpperCase(),
      sport,
      colorHex: color,
      orgId,
      roster: [],
    });
    setBusy(false);
    onCreated();
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>New team</Text>
      <TextField label="Name" value={name} onChange={setName} placeholder="Greenwood Strikers" />
      <TextField label="Short name" value={shortName} onChange={setShortName} placeholder={autoShort(name) || 'GS'} autoCapitalize="characters" />
      <Text style={textStyles.muted}>Sport</Text>
      <View style={st.chips}>
        {SPORT_LIST.map((s) => (
          <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sport === s.id} onPress={() => setSport(s.id)} />
        ))}
      </View>
      <Text style={textStyles.muted}>Colour</Text>
      <View style={st.chips}>
        {TEAM_COLORS.map((c) => (
          <TouchableOpacity accessibilityRole="button" key={c} accessibilityLabel={`Team colour ${c}`} accessibilityState={{ selected: color === c }} onPress={() => setColor(c)} activeOpacity={0.8}>
            <View style={[st.colorDot, { backgroundColor: c }, color === c && st.colorDotActive]} />
          </TouchableOpacity>
        ))}
      </View>
      <Button label={busy ? '…' : 'Create team'} onPress={() => void submit()} disabled={busy || !name.trim()} />
    </Card>
  );
}

/** Toggle players in/out of a team's roster. Players are filtered to those who
 *  play the team's sport. */
function RosterEditor({
  team, players, onChanged,
}: {
  team: Team;
  players: Player[];
  onChanged: () => void;
}) {
  const [roster, setRoster] = useState<string[]>(team.roster ?? []);
  const eligible = useMemo(
    () => players.filter((p) => p.sports.includes(team.sport)),
    [players, team.sport]
  );

  const toggle = (id: string) => {
    const next = roster.includes(id) ? roster.filter((x) => x !== id) : [...roster, id];
    setRoster(next);
    void setTeamRoster(team.id, next).then(onChanged);
  };

  return (
    <Card style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>Tap to add or remove · {roster.length} in squad</Text>
      {eligible.length === 0 ? (
        <EmptyState icon="👥" title={`No players for ${getSport(team.sport).name} yet`} compact />
      ) : (
        eligible.map((p) => {
          const inSquad = roster.includes(p.id);
          return (
            <TouchableOpacity accessibilityRole="button" key={p.id} accessibilityLabel={p.fullName} accessibilityState={{ selected: inSquad }} style={st.rosterRow} activeOpacity={0.8} onPress={() => toggle(p.id)}>
              <Text style={[st.rosterCheck, inSquad && { color: theme.colors.primary }]}>{inSquad ? '☑' : '☐'}</Text>
              <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{p.fullName}</Text>
              <Text style={textStyles.muted}>{p.city ?? ''}</Text>
            </TouchableOpacity>
          );
        })
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(3), padding: theme.spacing(4), paddingBottom: theme.spacing(2) },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), paddingHorizontal: theme.spacing(4), paddingBottom: theme.spacing(2) },
  section: { marginTop: theme.spacing(2) },
  membersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing(1) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  houseChip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2) },
  houseDot: { width: 10, height: 10, borderRadius: 5 },
  roleBlurb: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  addRow: { paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  addText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  pastMember: { opacity: 0.6 },
  memberIcon: { fontSize: 16 },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  year: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 1, marginTop: theme.spacing(1) },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: theme.spacing(3), marginTop: theme.spacing(1) },
  flex: { flex: 1 },
  swatch: { width: 18, height: 18, borderRadius: 5 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: theme.colors.text },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  rosterCheck: { fontSize: 18, color: theme.colors.textMuted },
  rosterNames: { color: theme.colors.textMuted, fontSize: theme.font.small, paddingHorizontal: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  headLinks: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'center' },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  rollRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  rollTarget: { width: 130 },
  nudge: { gap: theme.spacing(2), borderWidth: 1, borderColor: theme.colors.primary },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  warnStrong: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  onlyAdmin: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  errorCard: { borderWidth: 1, borderColor: theme.colors.danger },
  standardLine: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  classLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2) },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
});
