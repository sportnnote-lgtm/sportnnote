/** In-app calendar: a month grid with dots on days that have events or matches,
 *  plus a date-grouped agenda. Everything in the app is date-based — this is the
 *  single place to see it on a timeline. Tap a day for that day's items, or
 *  switch to Agenda for the upcoming list. */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Pill, SelectChip, textStyles } from '../components/ui';
import { useMatches, useOrganizations, useFollow } from '../data/hooks';
import { getTournaments, getMyPlayerId, getPlayer } from '../data/repos';
import { orgsForPlayer } from '../core/org';
import { useAuth } from '../core/auth';
import { getSport } from '../sports/registry';
import { exportToCalendar, type CalEvent } from '../core/ics';
import type { Match, Tournament, Player } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function CalendarScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { matches: allMatches } = useMatches('all');
  const orgs = useOrganizations();
  const { idsOfType } = useFollow(profile?.id);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getTournaments().then((t) => on && setTournaments(t));
      getMyPlayerId(profile?.id).then((id) => { if (id) getPlayer(id).then((p) => { if (on) setMe(p); }); });
      return () => { on = false; };
    }, [profile?.id])
  );

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const myId = me?.id;

  // "Mine" = matches I play/score/host, and tournaments I host, follow, belong to
  // via my community, or have a match in.
  const isMyTeam = (t: Match['homeTeam']) =>
    !!myId && ((t.roster?.includes(myId) ?? false) || (!!me?.houseName && t.name === me.houseName));
  const isMyMatch = (m: Match) =>
    !!myId && (m.scorerId === myId || (m.hostIds?.includes(myId) ?? false) || isMyTeam(m.homeTeam) || isMyTeam(m.awayTeam));
  const myOrgIds = useMemo(() => new Set(orgsForPlayer(orgs, myId).map((o) => o.id)), [orgs, myId]);
  const followedTournaments = useMemo(() => new Set(idsOfType('tournament')), [idsOfType]);
  const myMatchTournamentIds = useMemo(
    () => new Set(allMatches.filter(isMyMatch).map((m) => m.tournamentId).filter((id): id is string => !!id)),
    [allMatches, myId, me?.houseName]
  );
  const isMyTournament = (t: Tournament) =>
    !!myId && ((t.hostIds?.includes(myId) ?? false) || (!!t.hostOrgId && myOrgIds.has(t.hostOrgId)) || followedTournaments.has(t.id) || myMatchTournamentIds.has(t.id));

  const matches = scope === 'mine' ? allMatches.filter(isMyMatch) : allMatches;
  const scopedTournaments = scope === 'mine' ? tournaments.filter(isMyTournament) : tournaments;

  const now = new Date();
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() }); // visible month
  const [selected, setSelected] = useState(todayStr);

  // Matches indexed by their calendar day (YYYY-MM-DD).
  const matchesByDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const key = m.startsAt.slice(0, 10);
      (map.get(key) ?? map.set(key, []).get(key)!).push(m);
    }
    return map;
  }, [matches]);

  // A tournament "touches" a day if it runs on it; tracks which start that day.
  const tournamentsOnDay = (day: string) => scopedTournaments.filter((t) => t.startDate <= day && day <= t.endDate);
  const tournamentsStartingOn = (day: string) => scopedTournaments.filter((t) => t.startDate === day);

  const dayHasItems = (day: string) =>
    (matchesByDay.get(day)?.length ?? 0) > 0 || tournamentsStartingOn(day).length > 0;

  // Build the month grid cells (leading blanks for weekday offset).
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay();
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) arr.push(ymd(cursor.y, cursor.m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const m = c.m + delta;
      return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  };
  const goToday = () => { setCursor({ y: now.getFullYear(), m: now.getMonth() }); setSelected(todayStr); };

  const openMatch = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: false,
    });

  const matchRow = (m: Match) => {
    const live = m.status === 'live';
    const done = m.status === 'completed';
    return (
      <TouchableOpacity key={m.id} activeOpacity={0.85} onPress={() => openMatch(m)}>
        <Card style={st.itemRow}>
          <Text style={st.itemIcon}>{getSport(m.sport).icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.body} numberOfLines={1}>{m.homeTeam.name} vs {m.awayTeam.name}</Text>
            <Text style={textStyles.muted}>
              {timeOf(m.startsAt)}{m.venueName ? ` · ${m.venueName}` : ''}
              {done && m.score ? ` · ${m.score.home}–${m.score.away}` : ''}
            </Text>
          </View>
          {live ? <Pill label="LIVE" color={theme.colors.danger + '22'} textColor={theme.colors.danger} />
            : done ? <Pill label="Done" /> : <Pill label="Upcoming" color={theme.colors.primary + '22'} textColor={theme.colors.primary} />}
        </Card>
      </TouchableOpacity>
    );
  };

  const tournamentRow = (t: Tournament, note?: string) => (
    <TouchableOpacity key={t.id} activeOpacity={0.85} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>
      <Card style={st.itemRow}>
        <Text style={st.itemIcon}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.body} numberOfLines={1}>{t.name}</Text>
          <Text style={textStyles.muted}>{t.sports.map((s) => getSport(s).icon).join(' ')} · {t.startDate} → {t.endDate}{note ? ` · ${note}` : ''}</Text>
        </View>
        <Text style={st.chevron}>›</Text>
      </Card>
    </TouchableOpacity>
  );

  // Agenda: upcoming matches + tournament starts, grouped by day (from today).
  const agendaDays = useMemo(() => {
    const map = new Map<string, { matches: Match[]; starts: Tournament[] }>();
    for (const m of matches) {
      const day = m.startsAt.slice(0, 10);
      if (day < todayStr || m.status === 'completed') continue;
      (map.get(day) ?? map.set(day, { matches: [], starts: [] }).get(day)!).matches.push(m);
    }
    for (const t of scopedTournaments) {
      if (t.startDate < todayStr) continue;
      (map.get(t.startDate) ?? map.set(t.startDate, { matches: [], starts: [] }).get(t.startDate)!).starts.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches, scopedTournaments, todayStr]);

  const selMatches = (matchesByDay.get(selected) ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const selTournaments = tournamentsOnDay(selected);

  // Build calendar (.ics) events for export.
  const matchEvent = (m: Match): CalEvent => ({
    uid: `m-${m.id}@sportfolio`,
    title: `${getSport(m.sport).icon} ${m.homeTeam.name} vs ${m.awayTeam.name}`,
    start: m.startsAt,
    location: m.venueName,
    description: `${getSport(m.sport).name} match`,
  });
  const tournamentEvent = (t: Tournament): CalEvent => ({
    uid: `t-${t.id}@sportfolio`,
    title: `🏆 ${t.name}`,
    start: t.startDate,
    end: t.endDate,
    description: `${t.sports.map((s) => getSport(s).name).join(', ')} · hosted by ${t.hostName}`,
  });
  const exportDay = () =>
    void exportToCalendar(`sportfolio-${selected}`, [...selTournaments.map(tournamentEvent), ...selMatches.map(matchEvent)]);
  const exportAgenda = () =>
    void exportToCalendar('sportfolio-upcoming', agendaDays.flatMap(([, it]) => [...it.starts.map(tournamentEvent), ...it.matches.map(matchEvent)]));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <View style={st.tabs}>
        <SelectChip label="📅 Month" active={view === 'month'} onPress={() => setView('month')} />
        <SelectChip label="📋 Agenda" active={view === 'agenda'} onPress={() => setView('agenda')} />
        <View style={{ flex: 1 }} />
        <Text style={st.todayLink} onPress={goToday}>Today</Text>
      </View>
      <View style={st.tabs}>
        <SelectChip label="👤 Mine" active={scope === 'mine'} onPress={() => setScope('mine')} />
        <SelectChip label="🌐 All" active={scope === 'all'} onPress={() => setScope('all')} />
      </View>

      <ScrollView contentContainerStyle={st.content}>
        {view === 'month' ? (
          <>
            <View style={st.monthHead}>
              <Text style={st.navArrow} onPress={() => shiftMonth(-1)}>‹</Text>
              <Text style={textStyles.h3}>{MONTHS[cursor.m]} {cursor.y}</Text>
              <Text style={st.navArrow} onPress={() => shiftMonth(1)}>›</Text>
            </View>

            <View style={st.weekRow}>
              {WEEKDAYS.map((w) => <Text key={w} style={st.weekday}>{w}</Text>)}
            </View>

            <View style={st.grid}>
              {cells.map((day, i) => {
                if (!day) return <View key={`b${i}`} style={st.cell} />;
                const d = Number(day.slice(8, 10));
                const isToday = day === todayStr;
                const isSel = day === selected;
                return (
                  <TouchableOpacity key={day} style={st.cell} activeOpacity={0.7} onPress={() => setSelected(day)}>
                    <View style={[st.cellInner, isSel && st.cellSel, isToday && !isSel && st.cellToday]}>
                      <Text style={[st.cellNum, isSel && st.cellNumSel]}>{d}</Text>
                      {dayHasItems(day) ? <View style={[st.dot, isSel && st.dotSel]} /> : <View style={st.dotPlaceholder} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={st.sectionHead}>
              <Text style={textStyles.h3}>{selected === todayStr ? 'Today' : selected}</Text>
              {selMatches.length + selTournaments.length > 0 && (
                <Text style={st.todayLink} onPress={exportDay}>＋ Add to calendar</Text>
              )}
            </View>
            {selMatches.length === 0 && selTournaments.length === 0 ? (
              <Text style={textStyles.muted}>Nothing scheduled.</Text>
            ) : (
              <>
                {selTournaments.map((t) => tournamentRow(t, t.startDate === selected ? 'starts today' : t.endDate === selected ? 'final day' : 'ongoing'))}
                {selMatches.map(matchRow)}
              </>
            )}
          </>
        ) : (
          <>
            {agendaDays.length > 0 && (
              <View style={st.sectionHead}>
                <Text style={textStyles.muted}>Upcoming {scope === 'mine' ? '· yours' : ''}</Text>
                <Text style={st.todayLink} onPress={exportAgenda}>＋ Add all to calendar</Text>
              </View>
            )}
            {agendaDays.length === 0 ? (
              <Text style={textStyles.muted}>No upcoming events or matches.</Text>
            ) : (
              agendaDays.map(([day, items]) => (
                <View key={day} style={{ gap: theme.spacing(2) }}>
                  <Text style={st.agendaDay}>{day === todayStr ? `Today · ${day}` : day}</Text>
                  {items.starts.map((t) => tournamentRow(t, 'starts'))}
                  {items.matches.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(matchRow)}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(2), paddingBottom: theme.spacing(2) },
  todayLink: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  content: { padding: theme.spacing(4), paddingTop: 0, gap: theme.spacing(3) },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing(2) },
  navArrow: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '800', paddingHorizontal: theme.spacing(3) },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cellInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm, gap: 2 },
  cellSel: { backgroundColor: theme.colors.primary },
  cellToday: { borderWidth: 1, borderColor: theme.colors.primary },
  cellNum: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  cellNumSel: { color: '#06120D', fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.accent },
  dotSel: { backgroundColor: '#06120D' },
  dotPlaceholder: { width: 5, height: 5 },
  section: { marginTop: theme.spacing(2) },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  itemIcon: { fontSize: 22 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  agendaDay: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.5, marginTop: theme.spacing(2) },
});
