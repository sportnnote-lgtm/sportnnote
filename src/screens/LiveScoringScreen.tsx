/**
 * Generic live-scoring screen. It is sport-agnostic: it looks up the plugin for
 * the match's sport, holds match state in a reducer driven by `plugin.reducer`,
 * renders the universal <Scoreboard/> from `plugin.summary`, and mounts the
 * plugin's own <ScoringControls/>. Adding a sport never touches this file.
 *
 * Where realtime fits later: every dispatched action would also be persisted to
 * Supabase (an `events` row) and broadcast on a realtime channel so viewers see
 * the score update instantly. The reducer being pure means the server can
 * replay the same events to authoritative state.
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { getSport } from '../sports/registry';
import { VoiceScorer } from '../sports/VoiceScorer';
import { Scoreboard } from '../components/Scoreboard';
import { MiniScore } from '../components/MiniScore';
import { Pill, textStyles } from '../components/ui';
import { useLiveMatch } from '../data/useLiveMatch';
import { matchOutbox } from '../data/matchOutbox';
import { getRoster, getPlayers, getLineup, getMatch, getTournaments, getMatchSquads, getMatchStatLines, getMyPlayerId, setMatchScorer, setMatchHosts, setMatchLogo, setMatchFormat, setMatchStream, setMatchManagers, getOrganizations, getTeamLeaders, getMatchDisputes, raiseDispute, updateDispute, dismissDispute, resolveDispute, escalateDispute, createReplacementPlayer } from '../data/repos';
import { LiveStream } from '../components/LiveStream';
import { DisputeMaskProvider } from '../core/disputeMask';
import { SelectChip, TextField, Button } from '../components/ui';
import { AddInvitePlayer } from '../components/AddInvitePlayer';
import { tournamentHostPlayerIds } from '../core/org';
import { matchEligibility } from '../core/eligibility';
import { useAuth } from '../core/auth';
import { openVenue } from '../core/venue';
import { formatDateTime, useUserTimeZone } from '../core/time';
import { exportToCalendar } from '../core/ics';
import { notify } from '../core/notifications';
import { MatchSummary } from '../components/MatchSummary';
import { HostsCard } from '../components/HostsCard';
import { LogoPicker } from '../components/LogoPicker';
import { MatchHeader } from '../components/MatchHeader';
import type { DisputeEvent, LineupSlot, Match, MatchDispute, MatchSquads, Player, SportId, StatLine, TeamLeadership } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveScoring'>;

export default function LiveScoringScreen({ route, navigation }: Props) {
  const {
    sport,
    homeName,
    awayName,
    homeTeamName,
    awayTeamName,
    homeColor,
    awayColor,
    matchId,
    canScore: routeCanScore = true,
  } = route.params;
  const plugin = getSport(sport);
  const { profile } = useAuth();

  // Who am I (this device), and who did the organizer designate to score?
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyPlayerId(id));
    return () => {
      on = false;
    };
  }, [profile?.id]);
  const [scorerId, setScorerId] = useState<string | undefined>(undefined);
  const [matchHostIds, setMatchHostIds] = useState<string[]>([]);
  const [homeLeaders, setHomeLeaders] = useState<TeamLeadership>({});
  const [awayLeaders, setAwayLeaders] = useState<TeamLeadership>({});

  const [meta, setMeta] = useState<{
    homeTeamId?: string; awayTeamId?: string; tournamentId?: string; tournamentName?: string;
    config?: Record<string, unknown>; venueName?: string; venueMapsUrl?: string; streamUrl?: string; startsAt?: string;
    tournamentHostIds?: string[];
    status?: Match['status']; score?: { home: number; away: number }; winner?: Match['winner'];
    logoUrl?: string; managers?: { home?: string; away?: string };
  }>({});
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId) {
        (async () => {
          const m = await getMatch(matchId);
          if (!m) return;
          const [tours, orgs, hl, al] = await Promise.all([
            getTournaments(), getOrganizations(), getTeamLeaders(m.homeTeam.id), getTeamLeaders(m.awayTeam.id),
          ]);
          const tour = tours.find((t) => t.id === m.tournamentId);
          // friendly per-match format overrides the tournament's format for the sport
          const config = (m.format ?? tour?.formats?.[sport]) as Record<string, unknown> | undefined;
          if (on) {
            setScorerId(m.scorerId);
            setMatchHostIds(m.hostIds ?? []);
            setHomeLeaders(hl);
            setAwayLeaders(al);
            setMeta({
              homeTeamId: m.homeTeam.id, awayTeamId: m.awayTeam.id, tournamentId: m.tournamentId,
              tournamentName: tour?.name, config, venueName: m.venueName, venueMapsUrl: m.venueMapsUrl, streamUrl: m.streamUrl, startsAt: m.startsAt,
              // org-hosted tournaments → every org member is a tournament host
              tournamentHostIds: tour ? tournamentHostPlayerIds(tour, orgs) : [],
              status: m.status, score: m.score, winner: m.winner, logoUrl: m.logoUrl, managers: m.managers,
            });
          }
        })();
      }
      return () => {
        on = false;
      };
    }, [matchId, sport])
  );

  // Only the designated scorer's device can score a real match. Ad-hoc local
  // games (no matchId) fall back to the caller's role-based capability.
  const hasMatch = !!matchId;
  const canScore = hasMatch ? !!myPlayerId && scorerId === myPlayerId : routeCanScore;
  // The scorer taps "Start the match" before scoring begins; a match with events
  // is already underway. (Timer sports then expose their clock-start control.)
  const [localStarted, setLocalStarted] = useState(false);
  // Editable live-stream link (organizer/scorer); seeded from the saved value.
  const [streamInput, setStreamInput] = useState('');
  const [editingStream, setEditingStream] = useState(false);
  useEffect(() => { setStreamInput(meta.streamUrl ?? ''); }, [meta.streamUrl]);
  // Per-dispute "add a new name" inputs (reassign to someone not in the system).
  const [newName, setNewName] = useState<Record<string, string>>({});

  const { state, dispatch, undo, eventCount, live, syncing } = useLiveMatch({
    matchId,
    sport,
    canScore,
    homeTeamName,
    awayTeamName,
    homeTeamId: meta.homeTeamId,
    awayTeamId: meta.awayTeamId,
    tournamentId: meta.tournamentId,
    config: meta.config,
  });

  const viewerTz = useUserTimeZone(); // show every time on this screen in the viewer's own zone
  const [homeFull, setHomeFull] = useState<Player[]>([]);
  const [awayFull, setAwayFull] = useState<Player[]>([]);
  // All players, only for resolving names of people outside the two rosters —
  // hosts, the scorer or a manager can be an organizer/referee who isn't a
  // squad member (otherwise their card would read a bare "Host").
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  useEffect(() => {
    let on = true;
    getPlayers().then((p) => on && setAllPlayers(p));
    return () => { on = false; };
  }, []);
  // Bumped after adding/inviting a player so the roster refetches.
  const [rosterNonce, setRosterNonce] = useState(0);
  useEffect(() => {
    let on = true;
    if (homeTeamName) getRoster(homeTeamName, sport).then((r) => on && setHomeFull(r));
    if (awayTeamName) getRoster(awayTeamName, sport).then((r) => on && setAwayFull(r));
    return () => {
      on = false;
    };
  }, [homeTeamName, awayTeamName, sport, rosterNonce]);
  // Organizer-invited players still pending registration (shown as "invited").
  const invitedPlayers = useMemo(() => [...homeFull, ...awayFull].filter((p) => p.invited), [homeFull, awayFull]);

  // Matchday squad (starting XI + subs). Refetch on focus so edits apply.
  const [squads, setSquads] = useState<MatchSquads | null>(null);
  const [disputes, setDisputes] = useState<MatchDispute[]>([]);
  const reloadDisputes = useCallback(() => {
    if (matchId) getMatchDisputes(matchId).then(setDisputes);
  }, [matchId]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId) {
        getMatchSquads(matchId).then((s) => on && setSquads(s));
        getMatchDisputes(matchId).then((d) => on && setDisputes(d));
      }
      return () => {
        on = false;
      };
    }, [matchId])
  );
  const openDisputes = useMemo(() => disputes.filter((d) => d.status === 'open'), [disputes]);
  const reportedDisputes = useMemo(() => disputes.filter((d) => d.status === 'reported'), [disputes]);
  const settledDisputes = useMemo(() => disputes.filter((d) => d.status === 'resolved' || d.status === 'dismissed'), [disputes]);
  const disputedOpenIds = useMemo(() => new Set(openDisputes.map((d) => d.playerId)), [openDisputes]);
  // Already flagged (open OR reported) → don't offer object/report again.
  const flaggedIds = useMemo(() => new Set([...openDisputes, ...reportedDisputes].map((d) => d.playerId)), [openDisputes, reportedDisputes]);
  // What to hide as "X" on this match's live surfaces (only active/open disputes).
  const maskValue = useMemo(
    () => ({ ids: disputedOpenIds, names: new Set(openDisputes.map((d) => d.playerName)) }),
    [disputedOpenIds, openDisputes]
  );

  // The scoring roster = the matchday squad (starters then subs) if one is set,
  // otherwise the whole team squad.
  const applySquad = (full: Player[], squad?: { starters: string[]; subs: string[] }): Player[] => {
    if (!squad || squad.starters.length + squad.subs.length === 0) return full;
    const ids = [...squad.starters, ...squad.subs];
    return ids.map((id) => full.find((p) => p.id === id)).filter((p): p is Player => !!p);
  };
  const homeRoster = useMemo(() => applySquad(homeFull, squads?.home), [homeFull, squads]);
  const awayRoster = useMemo(() => applySquad(awayFull, squads?.away), [awayFull, squads]);
  // Only verified players can take part in scoring (under-18 → verified guardian;
  // 18+ → own verified mobile & email). Ineligible players are kept out of the
  // scoring roster & lineups so they can't be fielded or credited stats.
  const homeScoreRoster = useMemo(() => homeRoster.filter((p) => matchEligibility(p).ok), [homeRoster]);
  const awayScoreRoster = useMemo(() => awayRoster.filter((p) => matchEligibility(p).ok), [awayRoster]);
  const excludedCount = (homeRoster.length - homeScoreRoster.length) + (awayRoster.length - awayScoreRoster.length);

  // Lineup (for LiveExtras + clean sheets). Refetch on focus so edits show up.
  const [homeLineup, setHomeLineup] = useState<LineupSlot[]>([]);
  const [awayLineup, setAwayLineup] = useState<LineupSlot[]>([]);
  const [homeFormation, setHomeFormation] = useState<string | undefined>();
  const [awayFormation, setAwayFormation] = useState<string | undefined>();
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId) {
        getLineup(matchId, sport).then((l) => {
          if (on) {
            setHomeLineup(l.home);
            setAwayLineup(l.away);
            setHomeFormation(l.homeFormation);
            setAwayFormation(l.awayFormation);
          }
        });
      }
      return () => {
        on = false;
      };
    }, [matchId, sport])
  );

  const summary = useMemo(() => plugin.summary(state), [plugin, state]);
  // A match is complete if the live state says so, or it's an archived result.
  const complete = plugin.isComplete(state) || meta.status === 'completed';
  // Historical matches recorded only as a final result (no ball-by-ball log):
  // show the stored final score rather than an empty 0–0 scoreboard.
  const showFinalOnly = complete && eventCount === 0 && !!meta.score;
  // A match is underway once it has any recorded event, or the scorer hits start.
  const started = eventCount > 0 || localStarted;
  // Match-header status chip (Info tab): FINAL when done, LIVE while underway,
  // else UPCOMING. Distinct from `live` above, which means "synced to the backend".
  const matchLive = !complete && (meta.status === 'live' || started);
  const statusLabel = complete ? 'FINAL' : matchLive ? 'LIVE' : 'UPCOMING';

  // Header title reflects the match state: a completed game reads as match
  // details, a live one simply "Live", otherwise the default scoring title.
  useEffect(() => {
    const hName = homeTeamName ?? homeName;
    const aName = awayTeamName ?? awayName;
    navigation.setOptions({
      title: complete
        ? `${hName} vs ${aName} · Match Details`
        : meta.status === 'live'
        ? 'Live'
        : 'Live Scoring',
    });
  }, [navigation, complete, meta.status, homeName, awayName, homeTeamName, awayTeamName]);

  // Any host of the match — or of its tournament — manages it: designates the
  // scorer and edits the XI. Per-match ownership, not a global role, and any of
  // several hosts will do (so a single point of contact never blocks things).
  const allHostIds = useMemo(
    () => Array.from(new Set([...matchHostIds, ...(meta.tournamentHostIds ?? [])])),
    [matchHostIds, meta.tournamentHostIds]
  );
  const isHost = !!myPlayerId && allHostIds.includes(myPlayerId);
  const canManage = isHost && hasMatch && !complete;
  // A team's captain / vice-captain can set their own matchday squad.
  const iLeadHome = !!myPlayerId && (homeLeaders.captainId === myPlayerId || homeLeaders.viceCaptainId === myPlayerId);
  const iLeadAway = !!myPlayerId && (awayLeaders.captainId === myPlayerId || awayLeaders.viceCaptainId === myPlayerId);
  const canEditSquad = (canScore || canManage || iLeadHome || iLeadAway) && !complete;
  // Disputes can be reviewed/resolved by hosts, the scorer or either captain —
  // and unlike squad edits, even after full time (that's the whole point).
  const canResolveDisputes = !!myPlayerId && (isHost || canScore || iLeadHome || iLeadAway);
  // A participant (in either squad) can report another player on the field.
  const iAmInMatch = !!myPlayerId && [...homeRoster, ...awayRoster].some((p) => p.id === myPlayerId);

  // Candidate scorers = everyone in the two matchday squads (deduped).
  const scorerCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [...homeRoster, ...awayRoster].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [homeRoster, awayRoster]);
  const nameOf = (id?: string) =>
    id ? [...homeFull, ...awayFull, ...scorerCandidates, ...allPlayers].find((p) => p.id === id)?.fullName : undefined;
  const scorerName = nameOf(scorerId);
  const iAmScorer = !!myPlayerId && scorerId === myPlayerId;

  // Per-team captain/squad helpers for the matchday-squad reminders.
  const leadersFor = (sd: 'home' | 'away') => (sd === 'home' ? homeLeaders : awayLeaders);
  const squadSet = (sd: 'home' | 'away') => ((sd === 'home' ? squads?.home : squads?.away)?.starters.length ?? 0) > 0;
  const remindCaptain = (sd: 'home' | 'away') => {
    if (!matchId) return;
    const L = leadersFor(sd);
    const teamNm = sd === 'home' ? homeName : awayName;
    const label = `${homeName} vs ${awayName}`;
    [L.captainId, L.viceCaptainId]
      .filter((x): x is string => !!x)
      .forEach((pid) =>
        void notify({ title: `📋 Squad needed — ${teamNm}`, body: `Please set your matchday squad for ${label}.`, playerId: pid, matchId })
      );
  };

  const [pickScorer, setPickScorer] = useState(false);
  const assignScorer = useCallback(
    async (id: string | null) => {
      if (!matchId) return;
      setScorerId(id ?? undefined);
      setPickScorer(false);
      await setMatchScorer(matchId, id);
      // Tell the new scorer they're on — prep reminders follow before kickoff.
      if (id) {
        const label = `${homeName} vs ${awayName}`;
        void notify({
          title: `🎯 You're the scorer — ${label}`,
          body: 'You\'ll run the live score from your device. We\'ll remind you before kickoff.',
          playerId: id,
          matchId,
        });
      }
    },
    [matchId, homeName, awayName]
  );

  const setHosts = useCallback(
    async (ids: string[]) => {
      if (!matchId) return;
      setMatchHostIds(ids);
      await setMatchHosts(matchId, ids);
    },
    [matchId]
  );

  // Match stat lines feed the generic Summary (sports without their own). Refetch
  // on focus and whenever the score changes so the ratings stay current.
  const [matchStats, setMatchStats] = useState<StatLine[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId && !plugin.Summary) getMatchStatLines(matchId).then((s) => on && setMatchStats(s));
      return () => {
        on = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId, eventCount])
  );

  // The live screen splits into Info / Score / Summary tabs for every sport.
  const [tab, setTab] = useState<string>('');
  const [infoOpen, setInfoOpen] = useState<'home' | 'away' | null>(null);

  const editSquad = (sd: 'home' | 'away') => {
    const perSide = meta.config?.playersPerSide ? Number(meta.config.playersPerSide) : undefined;
    if (sport === 'cricket') {
      // Cricket's lineup is an ordered XI + wicket-keeper, not a positional court.
      return navigation.navigate('CricketLineup', {
        matchId: matchId!, sport,
        homeTeamName: homeTeamName ?? homeName, awayTeamName: awayTeamName ?? awayName, homeColor, awayColor,
        playersPerSide: perSide,
      });
    }
    // Every other sport picks who plays first (the simple Start/Bench list). For
    // sports with a pitch/court, that screen offers an optional "arrange on pitch"
    // hand-off — positions are a refinement, never the gate to picking the XI.
    return navigation.navigate('MatchSquad', {
      matchId: matchId!, side: sd, teamName: sd === 'home' ? homeTeamName ?? homeName : awayTeamName ?? awayName,
      sport, playersPerSide: perSide, teamId: sd === 'home' ? meta.homeTeamId : meta.awayTeamId,
      homeTeamName: homeTeamName ?? homeName, awayTeamName: awayTeamName ?? awayName, homeColor, awayColor,
    });
  };

  const header = (
    <View style={st.header}>
      <Text style={st.sportName}>{plugin.icon} {plugin.name}</Text>
      <Pill label={live ? 'Synced' : 'Demo'} color={live ? theme.colors.primary + '22' : theme.colors.surfaceAlt} textColor={live ? theme.colors.primary : theme.colors.textMuted} />
    </View>
  );

  const undoBar = canScore && eventCount > 0 ? (
    <TouchableOpacity style={st.undoBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Undo last ${sport === 'cricket' ? 'ball' : 'update'}`} accessibilityHint="Tap repeatedly to rewind to any earlier point" onPress={undo}>
      <Text style={st.undoText}>↶  Undo</Text>
      <Text style={st.undoHint}>rewind step-by-step</Text>
    </TouchableOpacity>
  ) : null;

  const controlsNode = (
    <View style={st.controls}>
      {syncing ? (
        <Text style={[textStyles.muted, { textAlign: 'center' }]}>Syncing live score…</Text>
      ) : complete ? (
        <Text style={[textStyles.h3, { textAlign: 'center' }]}>✅ Match complete — final score saved</Text>
      ) : !canScore ? (
        <View style={{ gap: theme.spacing(2), alignItems: 'center' }}>
          {scorerId ? (
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>👀 Viewing live — {scorerName ?? 'the assigned scorer'} is scoring this match from their device.</Text>
          ) : (
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>
              👀 Viewing live — no scorer assigned yet.{canManage ? ' Assign one from the Info tab.' : ''}
            </Text>
          )}
        </View>
      ) : !started ? (
        <View style={{ gap: theme.spacing(3), alignItems: 'center' }}>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>You're the scorer for this match.</Text>
          <TouchableOpacity style={st.assignBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Start the match" onPress={() => setLocalStarted(true)}>
            <Text style={st.assignBtnText}>▶ Start the match</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: theme.spacing(3) }}>
          {excludedCount > 0 && (
            <Text style={st.eligNote}>
              🔒 {excludedCount} unverified player{excludedCount === 1 ? '' : 's'} hidden — only verified players can be scored (under-18 needs a verified guardian; 18+ needs verified mobile &amp; email).
            </Text>
          )}
          <plugin.ScoringControls
            state={state} dispatch={dispatch} homeName={homeName} awayName={awayName}
            homeColor={homeColor} awayColor={awayColor}
            homeRoster={homeScoreRoster} awayRoster={awayScoreRoster} homeLineup={homeLineup} awayLineup={awayLineup}
            homeKeeperId={squads?.home.keeperId} awayKeeperId={squads?.away.keeperId}
          />
          {plugin.voice && (
            <VoiceScorer
              voice={plugin.voice} state={state} dispatch={dispatch}
              homeName={homeName} awayName={awayName}
              homeRoster={homeScoreRoster} awayRoster={awayScoreRoster}
            />
          )}
        </View>
      )}
    </View>
  );

  // Archived result with no ball-by-ball log — a simple final-score card.
  const finalScoreNode = showFinalOnly ? (
    <View style={st.finalCard}>
      <Text style={st.finalLabel}>FINAL SCORE</Text>
      <View style={st.finalRow}>
        <Text style={[st.finalScore, { color: homeColor ?? theme.colors.home }]}>{meta.score!.home}</Text>
        <Text style={st.finalVs}>{homeName}  ·  {awayName}</Text>
        <Text style={[st.finalScore, { color: awayColor ?? theme.colors.away }]}>{meta.score!.away}</Text>
      </View>
      <Text style={st.finalResult}>
        {meta.winner === 'draw'
          ? 'Match drawn'
          : meta.winner
          ? `🏆 ${(meta.winner === 'home' ? homeName : awayName)} won`
          : 'Completed'}
      </Text>
    </View>
  ) : null;

  // The top scoreboard — a sport supplies its own, else the universal one. Cricket
  // hides it (its scorecard shows the score).
  const scoreboardNode = plugin.hideScoreboard ? null : plugin.Scoreboard ? (
    <plugin.Scoreboard state={state} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={!complete} />
  ) : (
    <Scoreboard
      summary={summary} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
      live={!complete} centerNode={plugin.LiveClock ? <plugin.LiveClock state={state} /> : undefined}
    />
  );

  const renderLiveExtras = (view?: string) => plugin.LiveExtras ? (
    <plugin.LiveExtras
      state={state} dispatch={dispatch} canScore={canScore} matchId={matchId}
      homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
      homeRoster={homeScoreRoster} awayRoster={awayScoreRoster} homeLineup={homeLineup} awayLineup={awayLineup}
      homeManager={meta.managers?.home} awayManager={meta.managers?.away} view={view}
      homeFormation={homeFormation} awayFormation={awayFormation}
    />
  ) : null;
  const liveExtrasNode = renderLiveExtras();

  const courtNode = !plugin.lineupsInExtras && plugin.Court && (homeLineup.length > 0 || awayLineup.length > 0) ? (
    <View style={st.lineups}>
      <View style={st.lineupHeader}>
        <Text style={textStyles.h3}>Lineups</Text>
        {canEditSquad && matchId && (
          <Text style={st.editLink} onPress={() => editSquad('home')}>Edit ›</Text>
        )}
      </View>
      <View style={st.legend}>
        <View style={[st.legendDot, { backgroundColor: homeColor ?? theme.colors.home }]} />
        <Text style={textStyles.muted}>{homeName}</Text>
        <View style={[st.legendDot, { backgroundColor: awayColor ?? theme.colors.away, marginLeft: theme.spacing(3) }]} />
        <Text style={textStyles.muted}>{awayName}</Text>
      </View>
      <plugin.Court homeLineup={homeLineup} awayLineup={awayLineup} homeColor={homeColor} awayColor={awayColor} />
    </View>
  ) : null;

  const noteNode = (
    <Text style={st.note}>
      {!canScore ? 'Viewer · updates arrive in realtime' : live ? (complete ? 'archived' : 'Scorer view · changes broadcast live to viewers') : 'Demo · local only — connect Supabase to broadcast'}
    </Text>
  );

  // Every sport gets the same shape: Info · <content views> · Summary · Scoring
  // (Scoring is the scorer-only tab holding the live controls, so they don't sit
  // below every view). A plugin can contribute multiple content views via
  // `liveViews`; otherwise it gets a single combined Score/Scorecard tab.
  const liveViews = plugin.liveViews ?? null;
  const contentViews = liveViews ?? [{ key: 'score', label: plugin.id === 'cricket' ? 'Scorecard' : 'Score' }];
  const TABS: { key: string; label: string }[] = [
    { key: 'info', label: 'Info' },
    ...contentViews,
    { key: 'summary', label: 'Summary' },
    ...(canScore ? [{ key: 'scoring', label: 'Scoring' }] : []),
  ];
  const defaultTab = canScore ? 'scoring' : contentViews[0].key;
  const activeTab = TABS.some((tb) => tb.key === tab) ? tab : defaultTab;
  const scrollTabs = TABS.length > 3;
    const fmt = meta.config ?? {};
    const dateStr = meta.startsAt ? formatDateTime(meta.startsAt, viewerTz) : '—';
    // Push this match into the viewer's own device calendar. The .ics DTSTART is
    // UTC, so every calendar shows it at the right local time automatically.
    const addToCalendar = () => {
      if (!meta.startsAt) return;
      void exportToCalendar(`${homeName}-vs-${awayName}`, [{
        uid: `match-${matchId ?? `${homeName}-${awayName}`}@sportfolio`,
        title: `${homeTeamName ?? homeName} vs ${awayTeamName ?? awayName}`,
        start: meta.startsAt,
        location: meta.venueName,
        description: [plugin.name, meta.tournamentName].filter(Boolean).join(' · '),
      }]);
    };
    const setManager = (sd: 'home' | 'away', v: string) => {
      if (!matchId) return;
      const value = v.trim() ? v : undefined;
      setMeta((m) => ({ ...m, managers: { ...(m.managers ?? {}), [sd]: value } }));
      void setMatchManagers(matchId, { [sd]: value ?? '' });
    };
    const squadCard = (sd: 'home' | 'away') => {
      const name = sd === 'home' ? homeName : awayName;
      const roster = sd === 'home' ? homeRoster : awayRoster;
      const color = (sd === 'home' ? homeColor : awayColor) ?? theme.colors.text;
      const open = infoOpen === sd;
      const L = leadersFor(sd);
      const set = squadSet(sd);
      const hasCaptain = !!(L.captainId || L.viceCaptainId);
      // Split the applied roster (ordered starters-then-subs) back into the two
      // groups so the sheet reads like a real team sheet; when no squad is set the
      // roster is the whole team, shown as one flat list.
      const sq = sd === 'home' ? squads?.home : squads?.away;
      const starterIds = new Set(sq?.starters ?? []);
      const starters = set ? roster.filter((p) => starterIds.has(p.id)) : roster;
      const subs = set ? roster.filter((p) => !starterIds.has(p.id)) : [];
      const count = (sq?.starters.length ?? 0) + (sq?.subs.length ?? 0);
      return (
        <View style={st.infoCard}>
          <TouchableOpacity activeOpacity={0.8} style={st.squadHead} accessibilityRole="button" accessibilityLabel={`${sd === 'home' ? homeTeamName ?? name : awayTeamName ?? name} squad — ${set ? 'set' : 'to be set'}`} accessibilityState={{ expanded: open }} onPress={() => setInfoOpen(open ? null : sd)}>
            <View style={[st.legendDot, { backgroundColor: color }]} />
            <Text style={[textStyles.body, { flex: 1, fontWeight: '700' }]}>{sd === 'home' ? homeTeamName ?? name : awayTeamName ?? name}</Text>
            <Text style={[textStyles.muted, { color: set ? theme.colors.primary : theme.colors.textMuted }]}>
              {set ? `✓ Squad set · ${count}` : 'Squad to be set'}
            </Text>
            <Text style={st.caret}>{open ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {/* captain & the organizer's nudge to get the matchday squad in */}
          {hasCaptain && (
            <Text style={textStyles.muted}>
              {L.captainId ? `Captain: ${nameOf(L.captainId) ?? '—'}` : ''}
              {L.viceCaptainId ? `${L.captainId ? ' · ' : ''}Vice: ${nameOf(L.viceCaptainId) ?? '—'}` : ''}
            </Text>
          )}
          {/* Setting the XI is a pre-match task — don't nag once the match is live or done. */}
          {!set && canManage && matchId && meta.status !== 'live' && meta.status !== 'completed' && (
            hasCaptain ? (
              <TouchableOpacity style={st.remindBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Remind the captain to set the squad" onPress={() => remindCaptain(sd)}>
                <Text style={st.remindText}>🔔 Remind {nameOf(L.captainId) ? `${nameOf(L.captainId)}` : 'captain'} to set the squad</Text>
              </TouchableOpacity>
            ) : (
              <Text style={textStyles.muted}>No captain set — assign one from the team's squad page to remind them.</Text>
            )
          )}

          {open && (
            <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(2) }}>
              {(() => {
                const playerRow = (p: Player) => {
                  const disputed = disputedOpenIds.has(p.id);
                  const reported = !disputed && flaggedIds.has(p.id);
                  const mine = p.id === myPlayerId;
                  const role = p.id === L.captainId ? 'C' : p.id === L.viceCaptainId ? 'V' : null;
                  const keeper = p.id === sq?.keeperId;
                  return (
                    <View key={p.id} style={st.partRow}>
                      {p.jerseyNo != null ? (
                        <View style={[st.jersey, { borderColor: color }]}><Text style={[st.jerseyNum, { color }]}>{p.jerseyNo}</Text></View>
                      ) : <View style={st.jersey} />}
                      <Text style={[textStyles.body, { flex: 1 }, disputed && st.disputedName]} numberOfLines={1}>
                        {disputed ? '❌ X — disputed' : p.fullName}
                        {!disputed && keeper ? '  🧤' : ''}
                        {reported ? '  ⚐ reported' : ''}
                      </Text>
                      {!disputed && role ? <View style={[st.roleTag, role === 'C' && st.roleCaptain]}><Text style={[st.roleTagText, role === 'C' && st.roleTagTextDark]}>{role}</Text></View> : null}
                      {mine && !disputed && !reported && matchId && (
                        <Text style={st.objectLink} accessibilityRole="button" accessibilityLabel="Object: I'm not in this match" onPress={() => objectToMatch(sd, p)}>🚩 Not me — object</Text>
                      )}
                      {!mine && iAmInMatch && !disputed && !reported && matchId && (
                        <Text style={st.objectLink} accessibilityRole="button" accessibilityLabel={`Report ${p.fullName}`} onPress={() => reportPlayer(sd, p)}>⚐ Report</Text>
                      )}
                    </View>
                  );
                };
                if (roster.length === 0) return <Text style={textStyles.muted}>Squad not set.</Text>;
                if (!set) return <>{roster.map(playerRow)}</>;
                return (
                  <>
                    <Text style={st.squadSection}>Starting {starters.length}</Text>
                    {starters.map(playerRow)}
                    {subs.length > 0 && <Text style={st.squadSection}>Substitutes {subs.length}</Text>}
                    {subs.map(playerRow)}
                  </>
                );
              })()}
              {/* Manager / coach — fully optional (local games often have none). */}
              {canManage && matchId ? (
                <View style={{ marginTop: theme.spacing(2) }}>
                  <TextField label="Manager / coach (optional)" value={meta.managers?.[sd] ?? ''} onChange={(v) => setManager(sd, v)} placeholder="e.g. L. de la Fuente" />
                </View>
              ) : meta.managers?.[sd] ? (
                <Text style={textStyles.muted}>🧑‍💼 Manager: {meta.managers[sd]}</Text>
              ) : null}
              {canEditSquad && matchId && <Text style={st.editLink} accessibilityRole="button" onPress={() => editSquad(sd)}>✎ Edit matchday squad</Text>}
              {/* Populate this team right here — the natural place to look. Locked to
                  this side, so there's no Home/Away toggle to get wrong. */}
              {canEditSquad && matchId && meta.homeTeamId && meta.awayTeamId && (
                <AddInvitePlayer
                  fixedSide={sd}
                  title={roster.length === 0 ? '＋ Add players to this team' : '＋ Add another player'}
                  homeTeamId={meta.homeTeamId} awayTeamId={meta.awayTeamId}
                  homeTeamName={homeTeamName} awayTeamName={awayTeamName}
                  sport={sport}
                  invited={(sd === 'home' ? homeFull : awayFull).filter((p) => p.invited)}
                  onChanged={() => setRosterNonce((n) => n + 1)}
                />
              )}
            </View>
          )}
        </View>
      );
    };

    const myName = nameOf(myPlayerId ?? undefined) ?? profile?.fullName ?? 'this device';
    const scorerCard = (
      <View style={st.infoCard}>
        <Text style={textStyles.h3}>Match scorer</Text>
        <Text style={textStyles.muted}>
          One device updates the score live; everyone else follows along. The organizer sets this before kickoff.
        </Text>
        <View style={st.scorerRow}>
          {scorerId ? (
            <View style={[st.scorerAvatar, iAmScorer && { backgroundColor: theme.colors.primary }]}>
              <Text style={[st.scorerAvatarText, iAmScorer && { color: '#0B0F14' }]}>{scorerInitials(scorerName)}</Text>
            </View>
          ) : (
            <View style={st.scorerAvatar}><Text style={st.scorerIcon}>➕</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[textStyles.body, { fontWeight: '700' }]} numberOfLines={1}>
              {scorerId ? (scorerName ?? 'Assigned scorer') : 'Not assigned yet'}
            </Text>
            <Text style={textStyles.muted} numberOfLines={1}>
              {!scorerId ? 'Set before kickoff' : iAmScorer ? '📱 Scoring from this device' : matchLive ? 'Scoring from their device' : 'Assigned scorer'}
            </Text>
          </View>
          {scorerId && matchLive ? (
            <View style={st.scorerLive}><View style={st.scorerLiveDot} /><Text style={st.scorerLiveText}>LIVE</Text></View>
          ) : null}
          {canManage && (
            <Text
              style={st.editLink}
              accessibilityRole="button"
              accessibilityState={{ expanded: pickScorer }}
              onPress={() => setPickScorer((v) => !v)}
            >
              {pickScorer ? 'Close' : scorerId ? 'Change' : 'Assign'}
            </Text>
          )}
        </View>
        {!canManage && !scorerId && (
          <Text style={textStyles.muted}>Waiting for the organizer to assign a scorer.</Text>
        )}
        {canManage && pickScorer && (
          <View style={st.scorerPicker}>
            {myPlayerId && !iAmScorer && (
              <TouchableOpacity style={st.scorerOpt} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Score from this device as ${myName}`} onPress={() => assignScorer(myPlayerId)}>
                <Text style={st.scorerOptText}>📱 This device — {myName}</Text>
              </TouchableOpacity>
            )}
            {scorerCandidates.map((p) => (
              <TouchableOpacity key={p.id} style={st.scorerOpt} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Make ${p.fullName} the scorer`} accessibilityState={{ selected: p.id === scorerId }} onPress={() => assignScorer(p.id)}>
                <Text style={[st.scorerOptText, p.id === scorerId && { color: theme.colors.primary, fontWeight: '800' }]}>
                  {p.id === scorerId ? '✓ ' : ''}{p.fullName}
                </Text>
              </TouchableOpacity>
            ))}
            {scorerCandidates.length === 0 && (
              <Text style={textStyles.muted}>Set the matchday squads first to pick a scorer from the players.</Text>
            )}
            {scorerId && (
              <TouchableOpacity style={st.scorerOpt} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Clear scorer" onPress={() => assignScorer(null)}>
                <Text style={[st.scorerOptText, { color: theme.colors.danger }]}>✕ Clear scorer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );

    // Per-match scoring settings (football): toggle which stats are captured and
    // tweak half length — game-wise, for last-minute changes (rain, stand-in
    // scorer, etc.). Saving re-derives the live state with the new config.
    const applyFormat = (patch: Record<string, number | string | boolean>) => {
      if (!matchId) return;
      void setMatchFormat(matchId, patch);
      setMeta((m) => ({ ...m, config: { ...(m.config ?? {}), ...patch } }));
    };
    const fb = sport === 'football' ? (state as { track?: Record<string, boolean>; halfMinutes?: number }) : undefined;
    const TRACKABLE: [string, string][] = [
      ['shots', 'Shots'], ['possession', 'Possession'], ['passes', 'Passes'], ['fouls', 'Fouls'],
      ['cards', 'Cards'], ['offsides', 'Offsides'], ['corners', 'Corners'], ['tackles', 'Tackles'],
      ['interceptions', 'Interceptions'], ['saves', 'Saves'],
      ['attackContribution', 'Attacking play'], ['defenceContribution', 'Defensive play'],
    ];
    const cap = (k: string) => k[0].toUpperCase() + k.slice(1);
    const scoringSettingsCard = fb && (canScore || canManage) && !complete ? (
      <View style={st.infoCard}>
        <Text style={textStyles.h3}>⚙️ Scoring settings</Text>
        <Text style={textStyles.muted}>Capture only what this scorer can keep up with — toggles apply to this match only.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginTop: theme.spacing(2) }}>
          {TRACKABLE.map(([key, label]) => {
            const on = fb.track?.[key] ?? false;
            return <SelectChip key={key} label={`${on ? '✓ ' : ''}${label}`} active={on} onPress={() => applyFormat({ [`track${cap(key)}`]: !on })} />;
          })}
        </View>
        <View style={st.infoRow}>
          <Text style={textStyles.muted}>Half length</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) }}>
            <SelectChip label="−5" active={false} onPress={() => applyFormat({ halfMinutes: Math.max(5, (fb.halfMinutes ?? 45) - 5) })} />
            <Text style={[textStyles.body, { fontWeight: '800', minWidth: 64, textAlign: 'center' }]}>{fb.halfMinutes ?? 45} min</Text>
            <SelectChip label="+5" active={false} onPress={() => applyFormat({ halfMinutes: Math.min(60, (fb.halfMinutes ?? 45) + 5) })} />
          </View>
        </View>
      </View>
    ) : null;

    // Live-stream link — any host/scorer can add or change it before & during the
    // match; when set, the player pins to the top of the screen for everyone.
    const saveStream = (url: string | null) => {
      if (!matchId) return;
      void setMatchStream(matchId, url);
      setMeta((m) => ({ ...m, streamUrl: url ?? undefined }));
    };
    const streamUrl = meta.streamUrl;
    const streamPlatform = streamUrl
      ? (/(youtube\.com|youtu\.be)/i.test(streamUrl) ? '▶️ YouTube' : /twitch\.tv/i.test(streamUrl) ? '🟣 Twitch' : '🔗 Link')
      : null;
    const streamSettingsCard = hasMatch && (canScore || canManage) && !complete ? (
      <View style={st.infoCard}>
        <View style={st.streamHead}>
          <Text style={textStyles.h3}>📺 Live stream</Text>
          {streamUrl && !editingStream ? <View style={st.streamPill}><View style={st.streamDot} /><Text style={st.streamPillText}>ON</Text></View> : null}
        </View>
        {streamUrl && !editingStream ? (
          <>
            <View style={st.streamRow}>
              <Text style={st.streamPlatform}>{streamPlatform}</Text>
              <Text style={[textStyles.muted, { flex: 1 }]} numberOfLines={1}>{streamUrl.replace(/^https?:\/\//, '')}</Text>
            </View>
            <Text style={textStyles.muted}>Pinned to the top of this match for everyone watching.</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
              <Button label="Change" variant="ghost" style={{ flex: 1 }} onPress={() => setEditingStream(true)} />
              <Button label="Remove" variant="ghost" onPress={() => { saveStream(null); setStreamInput(''); }} />
            </View>
          </>
        ) : (
          <>
            <Text style={textStyles.muted}>Optional — paste a YouTube or Twitch link and it shows at the top of this match for everyone watching. Leave blank for none.</Text>
            <TextField
              label="Stream link"
              value={streamInput}
              onChange={setStreamInput}
              placeholder="youtu.be/… · youtube.com/live/… · twitch.tv/…"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
              <Button label="Save stream" style={{ flex: 1 }} onPress={() => { saveStream(streamInput.trim() || null); setEditingStream(false); }} />
              {streamUrl && editingStream && <Button label="Cancel" variant="ghost" onPress={() => { setStreamInput(streamUrl); setEditingStream(false); }} />}
            </View>
          </>
        )}
      </View>
    ) : null;

    // ----- Participation disputes -----
    // Notify the people who can act on a dispute — organizers (match + tournament
    // hosts) and both captains — minus whoever raised it. In the single-device demo
    // these land in the local feed; a real backend routes each to that person.
    const notifyStakeholders = (title: string, body: string) => {
      const ids = new Set<string>(allHostIds);
      if (homeLeaders.captainId) ids.add(homeLeaders.captainId);
      if (awayLeaders.captainId) ids.add(awayLeaders.captainId);
      if (myPlayerId) ids.delete(myPlayerId);
      const recipients = [...ids];
      if (recipients.length === 0) { void notify({ title, body, matchId }); return; }
      recipients.forEach((id) => void notify({ title, body, matchId, playerId: id }));
    };
    // Who's performing dispute actions — stamped onto every audit-trail entry.
    const disputeActor = { id: myPlayerId ?? undefined, name: nameOf(myPlayerId ?? undefined) ?? profile?.fullName ?? undefined };
    const objectToMatch = (sd: 'home' | 'away', p: Player) => {
      if (!matchId || !myPlayerId) return;
      void raiseDispute({ matchId, side: sd, playerId: p.id, playerName: p.fullName, raisedBy: myPlayerId, kind: 'objection' }).then(() => {
        reloadDisputes();
        notifyStakeholders('🚩 Participation objection', `${p.fullName} says they aren't playing in ${homeName} vs ${awayName}. Their name is held as “X” — please confirm who actually played (match Info tab).`);
      });
    };
    // A peer reports someone else on the field → organizers & captains are notified.
    const reportPlayer = (sd: 'home' | 'away', p: Player) => {
      if (!matchId || !myPlayerId) return;
      const reporter = nameOf(myPlayerId) ?? profile?.fullName ?? 'A player';
      void raiseDispute({ matchId, side: sd, playerId: p.id, playerName: p.fullName, raisedBy: myPlayerId, raisedByName: reporter, kind: 'report' }).then(() => {
        reloadDisputes();
        notifyStakeholders('🚩 Participation reported', `${reporter} reported that ${p.fullName} may not have played in ${homeName} vs ${awayName}. Organizer to verify off-app, then escalate or dismiss (Info tab).`);
      });
    };
    const escalate = (d: MatchDispute) => {
      void escalateDispute(d.id, disputeActor).then(() => {
        afterResolve();
        notifyStakeholders('🚩 Reassignment needed', `A reported identity in ${homeName} vs ${awayName} was escalated — captains, please confirm who actually played.`);
      });
    };
    const addNewReplacement = (d: MatchDispute) => {
      const nm = (newName[d.id] ?? '').trim();
      if (!nm || !matchId) return;
      const house = d.side === 'home' ? (homeTeamName ?? homeName) : (awayTeamName ?? awayName);
      void createReplacementPlayer(nm, sport, house).then((p) => {
        setNewName((n) => ({ ...n, [d.id]: '' }));
        void updateDispute(d.id, { replacementId: p.id, replacementName: p.fullName }, disputeActor).then(reloadDisputes);
      });
    };
    const afterResolve = () => {
      reloadDisputes();
      if (matchId) {
        getMatchSquads(matchId).then(setSquads);
        if (!plugin.Summary) getMatchStatLines(matchId).then(setMatchStats);
      }
    };
    const flaggedCount = openDisputes.length + reportedDisputes.length;
    const disputeBanner = flaggedCount > 0 ? (
      <TouchableOpacity style={st.disputeBanner} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open match info to review disputes" onPress={() => setTab('info')}>
        <Text style={st.disputeBannerText}>
          {openDisputes.length > 0
            ? `🚩 ${openDisputes.length} participation ${openDisputes.length === 1 ? 'dispute' : 'disputes'} under review — affected names are held as “X”. `
            : ''}
          {reportedDisputes.length > 0 ? `⚐ ${reportedDisputes.length} ${reportedDisputes.length === 1 ? 'report' : 'reports'} awaiting organizer review. ` : ''}
          Tap to review.
        </Text>
      </TouchableOpacity>
    ) : null;
    const disputesCard = disputes.length > 0 ? (
      <View style={st.infoCard}>
        <View style={st.streamHead}>
          <Text style={textStyles.h3}>🚩 Participation disputes</Text>
          {flaggedCount > 0 ? <View style={st.disputeCount}><Text style={st.disputeCountText}>{flaggedCount} ACTIVE</Text></View> : null}
        </View>
        <Text style={textStyles.muted}>Objections (the player themselves) hide the name as “X” immediately. Reports (from a teammate or opponent) notify the organizer, who decides whether to escalate after a ground-level check. Reassigning moves the scores to whoever actually played, once both captains confirm.</Text>

        {/* Peer reports awaiting the organizer's call. */}
        {reportedDisputes.length > 0 && <Text style={st.squadSection}>Reported {reportedDisputes.length}</Text>}
        {reportedDisputes.map((d) => (
          <View key={d.id} style={st.disputeBox}>
            <View style={st.disputeTitleRow}>
              <Text style={[textStyles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{d.playerName} — {d.side === 'home' ? homeName : awayName}</Text>
              <DisputeTag kind="reported" />
            </View>
            <Text style={textStyles.muted}>Reported by {d.raisedByName ?? 'a player'}. Organizer to verify off-app, then escalate or dismiss.</Text>
            {canResolveDisputes ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                <Button label="Escalate (hold as X)" style={{ flex: 1 }} onPress={() => escalate(d)} />
                <Button label="Dismiss" variant="ghost" onPress={() => void dismissDispute(d.id, disputeActor).then(reloadDisputes)} />
              </View>
            ) : (
              <Text style={textStyles.muted}>Awaiting the organizer.</Text>
            )}
            <DisputeHistory events={d.history} />
          </View>
        ))}

        {openDisputes.length > 0 && <Text style={st.squadSection}>Under review {openDisputes.length}</Text>}
        {openDisputes.map((d) => {
          const sideRoster = (d.side === 'home' ? homeFull : awayFull).filter((p) => p.id !== d.playerId);
          const ready = !!d.replacementId && !!d.homeCaptainOk && !!d.awayCaptainOk;
          return (
            <View key={d.id} style={st.disputeBox}>
              <View style={st.disputeTitleRow}>
                <Text style={[textStyles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{d.playerName}’s spot — {d.side === 'home' ? homeName : awayName}</Text>
                <DisputeTag kind="open" />
              </View>
              {!canResolveDisputes ? (
                <Text style={textStyles.muted}>Awaiting both captains and the organizer to review.</Text>
              ) : (
                <>
                  <Text style={textStyles.muted}>Who actually played?</Text>
                  <View style={st.chipsWrap}>
                    {sideRoster.map((p) => (
                      <SelectChip key={p.id} label={p.fullName} active={d.replacementId === p.id}
                        onPress={() => void updateDispute(d.id, { replacementId: p.id, replacementName: p.fullName }, disputeActor).then(reloadDisputes)} />
                    ))}
                  </View>
                  <Text style={textStyles.muted}>…or someone not listed:</Text>
                  <View style={{ flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' }}>
                    <View style={{ flex: 1 }}>
                      <TextField label="" value={newName[d.id] ?? ''} onChange={(v) => setNewName((n) => ({ ...n, [d.id]: v }))} placeholder="New player's name" autoCapitalize="words" />
                    </View>
                    <Button label="Add" variant="ghost" disabled={!(newName[d.id] ?? '').trim()} onPress={() => addNewReplacement(d)} />
                  </View>
                  <Text style={textStyles.muted}>Both captains must confirm:</Text>
                  <View style={st.chipsWrap}>
                    <SelectChip label={`${d.homeCaptainOk ? '✓ ' : ''}${homeName} captain`} active={!!d.homeCaptainOk}
                      onPress={() => void updateDispute(d.id, { homeCaptainOk: !d.homeCaptainOk }, disputeActor).then(reloadDisputes)} />
                    <SelectChip label={`${d.awayCaptainOk ? '✓ ' : ''}${awayName} captain`} active={!!d.awayCaptainOk}
                      onPress={() => void updateDispute(d.id, { awayCaptainOk: !d.awayCaptainOk }, disputeActor).then(reloadDisputes)} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                    <Button label={d.replacementName ? `Reassign to ${d.replacementName}` : 'Reassign'} style={{ flex: 1 }} disabled={!ready}
                      onPress={() => void resolveDispute(d.id, disputeActor).then(afterResolve)} />
                    <Button label="Dismiss" variant="ghost" onPress={() => void dismissDispute(d.id, disputeActor).then(reloadDisputes)} />
                  </View>
                  {!ready && <Text style={textStyles.muted}>Pick who played and get both captains to confirm to enable reassignment.</Text>}
                </>
              )}
              <DisputeHistory events={d.history} />
            </View>
          );
        })}

        {settledDisputes.length > 0 && (
          <>
            <Text style={st.squadSection}>Resolved &amp; dismissed {settledDisputes.length}</Text>
            {settledDisputes.map((d) => (
              <View key={d.id} style={[st.disputeBox, { opacity: 0.85 }]}>
                <View style={st.disputeTitleRow}>
                  <Text style={[textStyles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                    {d.playerName} — {d.side === 'home' ? homeName : awayName}
                    {d.status === 'resolved' && d.replacementName ? ` → ${d.replacementName}` : ''}
                  </Text>
                  <DisputeTag kind={d.status === 'resolved' ? 'resolved' : 'dismissed'} />
                </View>
                <DisputeHistory events={d.history} />
              </View>
            ))}
          </>
        )}
      </View>
    ) : null;

    return (
      <SafeAreaView style={st.safe} edges={['top']}>
       <DisputeMaskProvider value={maskValue}>
        <ScrollView contentContainerStyle={st.content}>
          {header}
          {/* Optional live stream — pinned at the very top when the organizer set one. */}
          {!!meta.streamUrl && <LiveStream url={meta.streamUrl} live={meta.status === 'live'} />}
          {disputeBanner}
          {/* Score pinned above the tabs so it stays visible on every tab
              (cricket hides it — its scorecard shows the score). On the Scoring
              tab a compact MiniScore replaces it (rendered by the controls), so
              the score sits next to the buttons instead of being duplicated. */}
          {showFinalOnly ? finalScoreNode : (activeTab === 'scoring' && started && !complete ? null : scoreboardNode)}
          {scrollTabs ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabScroll}>
              {TABS.map((t) => (
                <TouchableOpacity key={t.key} style={[st.tabChip, activeTab === t.key && st.tabActive]} activeOpacity={0.8} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: activeTab === t.key }} onPress={() => setTab(t.key)}>
                  <Text style={[st.tabText, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={st.tabBar}>
              {TABS.map((t) => (
                <TouchableOpacity key={t.key} style={[st.tab, activeTab === t.key && st.tabActive]} activeOpacity={0.8} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: activeTab === t.key }} onPress={() => setTab(t.key)}>
                  <Text style={[st.tabText, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* A plugin-contributed content view (e.g. football Lineups/Stats/Timeline). */}
          {liveViews && liveViews.some((v) => v.key === activeTab) && renderLiveExtras(activeTab)}

          {/* The combined Score/Scorecard tab for sports without explicit views. */}
          {!liveViews && activeTab === 'score' && (
            <>
              {liveExtrasNode}
              {courtNode}
            </>
          )}

          {/* The scorer's controls live on their own tab now. */}
          {activeTab === 'scoring' && (
            <>
              <View style={st.infoCard}>
                <MatchHeader
                  sportIcon={plugin.icon} sportName={plugin.name}
                  statusLabel={statusLabel} matchLive={matchLive} complete={complete}
                  homeName={homeTeamName ?? homeName} awayName={awayTeamName ?? awayName}
                  homeColor={homeColor} awayColor={awayColor}
                  hasMatch={hasMatch} logoUrl={meta.logoUrl} canManage={canManage}
                  onPickLogo={(uri) => matchId && setMatchLogo(matchId, uri)}
                />
              </View>
              {matchId && canScore ? <OfflineSyncBanner matchId={matchId} /> : null}
              {/* Running score, so the scorer never leaves this tab to check the
                  state. The big board above the tabs is suppressed here to avoid
                  duplication. Sports with a broadcast board (tennis/volleyball/
                  badminton/basketball/kabaddi) show the same line-score the viewer
                  sees; football/cricket keep the compact one-row MiniScore. */}
              {started && !complete && (
                plugin.Scoreboard ? (
                  <plugin.Scoreboard state={state} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} />
                ) : (
                  <MiniScore
                    summary={summary} homeName={homeName} awayName={awayName}
                    homeColor={homeColor} awayColor={awayColor} live={live}
                    clockNode={plugin.LiveClock ? <plugin.LiveClock state={state} /> : undefined}
                  />
                )
              )}
              {undoBar}
              {canScore && meta.homeTeamId && meta.awayTeamId && (
                <AddInvitePlayer
                  homeTeamId={meta.homeTeamId} awayTeamId={meta.awayTeamId}
                  homeTeamName={homeTeamName} awayTeamName={awayTeamName}
                  sport={sport} invited={invitedPlayers}
                  onChanged={() => setRosterNonce((n) => n + 1)}
                />
              )}
              {controlsNode}
            </>
          )}

          {activeTab === 'info' && (
            <View style={{ gap: theme.spacing(3) }}>
              <View style={st.infoCard}>
                <MatchHeader
                  sportIcon={plugin.icon} sportName={plugin.name}
                  statusLabel={statusLabel} matchLive={matchLive} complete={complete}
                  homeName={homeTeamName ?? homeName} awayName={awayTeamName ?? awayName}
                  homeColor={homeColor} awayColor={awayColor}
                  hasMatch={hasMatch} logoUrl={meta.logoUrl} canManage={canManage}
                  onPickLogo={(uri) => matchId && setMatchLogo(matchId, uri)}
                />
                <InfoRow icon="📋" label="Format" value={formatLine(sport, fmt)} />
                <InfoRow icon="📅" label="Date" value={dateStr} />
                <InfoRow
                  icon="📍" label="Venue"
                  value={meta.venueName ?? '—'}
                  onPress={meta.venueName ? () => openVenue(meta.venueName, meta.venueMapsUrl) : undefined}
                  accessibilityLabel={meta.venueName ? `Open ${meta.venueName} in maps` : undefined}
                />
                {meta.tournamentName && meta.tournamentId && (
                  <InfoRow
                    icon="🏆" label="Tournament"
                    value={`${meta.tournamentName} ›`}
                    onPress={() => navigation.navigate('Tournament', { tournamentId: meta.tournamentId! })}
                    accessibilityLabel={`Open ${meta.tournamentName}`}
                  />
                )}
                {meta.startsAt && (
                  <Button label="📅 Add to my calendar" variant="ghost" onPress={addToCalendar} style={{ marginTop: theme.spacing(2) }} />
                )}
              </View>
              {disputesCard}
              {hasMatch && scorerCard}
              {hasMatch && streamSettingsCard}
              {hasMatch && scoringSettingsCard}
              {hasMatch && (
                <HostsCard
                  hostIds={matchHostIds}
                  nameOf={(id) => nameOf(id) ?? undefined}
                  candidates={scorerCandidates.map((p) => ({ id: p.id, name: p.fullName }))}
                  canManage={canManage}
                  onChange={setHosts}
                  meId={myPlayerId ?? undefined}
                  subtitle="Hosts for this game (in addition to the tournament's hosts). Reminders to assign a scorer go to all of them."
                />
              )}
              <Text style={textStyles.h3}>Matchday squads</Text>
              {squadCard('home')}
              {squadCard('away')}
            </View>
          )}

          {activeTab === 'summary' && (
            <View style={{ gap: theme.spacing(3) }}>
              <View style={st.infoCard}>
                <MatchHeader
                  sportIcon={plugin.icon} sportName={plugin.name}
                  statusLabel={statusLabel} matchLive={matchLive} complete={complete}
                  homeName={homeTeamName ?? homeName} awayName={awayTeamName ?? awayName}
                  homeColor={homeColor} awayColor={awayColor}
                  hasMatch={hasMatch} logoUrl={meta.logoUrl} canManage={canManage}
                  onPickLogo={(uri) => matchId && setMatchLogo(matchId, uri)}
                />
              </View>
              {plugin.Summary ? (
              <plugin.Summary
                state={state} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
                onPlayer={(pid) => navigation.navigate('PlayerProfile', { playerId: pid })}
              />
            ) : (
              <MatchSummary
                statLines={matchStats} sport={sport} homeRoster={homeRoster} awayRoster={awayRoster}
                homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
                summary={summary} complete={complete}
                onPlayer={(pid) => navigation.navigate('PlayerProfile', { playerId: pid })}
              />
              )}
            </View>
          )}

          {noteNode}
        </ScrollView>
       </DisputeMaskProvider>
      </SafeAreaView>
    );
}

/** Up to two initials from a name, for the scorer avatar. */
function scorerInitials(name?: string): string {
  const parts = (name ?? '').split(' ').filter(Boolean);
  return parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🎯';
}

/** Human-readable summary of a match's chosen format, per sport. */
function formatLine(sport: SportId, fmt: Record<string, unknown>): string {
  const parts: string[] = [];
  if (fmt.overs != null) parts.push(`${fmt.overs} overs`);
  if (fmt.playersPerSide != null) parts.push(`${fmt.playersPerSide}-a-side`);
  if (fmt.substitutes != null && Number(fmt.substitutes) > 0) parts.push(`${fmt.substitutes} subs`);
  if (sport === 'cricket' && fmt.impactPlayer) parts.push('Impact Player');
  if (sport === 'cricket' && Number(fmt.powerplayOvers ?? 0) > 0) parts.push(`PP ${fmt.powerplayOvers}`);
  if (sport === 'basketball' && fmt.foulsToFoulOut != null) parts.push(`${fmt.foulsToFoulOut} fouls out`);
  // set/game-based sports — describe the match length
  const bestOf = (n: number, unit: string) => (n === 1 ? `single ${unit}` : `best of ${n * 2 - 1} ${unit}s`);
  if ((sport === 'volleyball' || sport === 'tennis') && fmt.setsToWin != null) parts.push(bestOf(Number(fmt.setsToWin), 'set'));
  if (sport === 'volleyball' && fmt.pointsPerSet != null) parts.push(`to ${fmt.pointsPerSet}`);
  if (sport === 'badminton') {
    if (fmt.pointsPerGame != null) parts.push(`to ${fmt.pointsPerGame}`);
    if (fmt.gamesToWin != null) parts.push(bestOf(Number(fmt.gamesToWin), 'game'));
  }
  if (sport === 'kabaddi' && fmt.halfMinutes != null) parts.push(`${fmt.halfMinutes}-min halves`);
  return parts.length ? parts.join(' · ') : '—';
}

function InfoRow({ icon, label, value, onPress, accessibilityLabel }: {
  icon?: string;
  label: string;
  value: string;
  /** when set, the value renders as a tappable link (venue, tournament) */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={st.infoRow}>
      <View style={st.infoLabelWrap}>
        {icon ? <Text style={st.infoIcon}>{icon}</Text> : null}
        <Text style={textStyles.muted}>{label}</Text>
      </View>
      {onPress ? (
        <Text style={st.venueLink} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} numberOfLines={1}>{value}</Text>
      ) : (
        <Text style={[textStyles.body, st.infoValue]} numberOfLines={1}>{value}</Text>
      )}
    </View>
  );
}

/** Reassures the scorer that nothing is lost when the connection drops: shows how
 *  many taps are saved locally and waiting to sync, with a manual retry. Hidden
 *  when online and fully synced. */
function OfflineSyncBanner({ matchId }: { matchId: string }) {
  useSyncExternalStore(matchOutbox.subscribe, matchOutbox.getSnapshot);
  const pending = matchOutbox.pendingCount(matchId);
  const online = matchOutbox.isOnline();
  // Sync failing on a working connection is a different problem from being
  // offline: it won't fix itself, so promising "it'll sync when you reconnect"
  // would be false reassurance.
  const stuck = matchOutbox.isStuck(matchId);
  if (online && pending === 0 && !stuck) return null;
  const offline = !online;
  const n = `${pending} change${pending === 1 ? '' : 's'}`;
  const title = stuck ? "⚠️ Can't sync right now" : offline ? '⚠️ Offline — scoring saved on this device' : `↻ Syncing ${n}…`;
  return (
    <View style={[st.syncBanner, offline || stuck ? st.syncOffline : st.syncPending]}>
      <View style={{ flex: 1 }}>
        <Text style={st.syncTitle}>{title}</Text>
        <Text style={st.syncSub}>
          {stuck
            ? `${n} saved safely on this device. Keep scoring — then tap Retry. If it keeps failing, contact support and quote this match.`
            : pending > 0
            ? offline
              ? `${n} saved here — they'll sync automatically when you're back online.`
              : `${n} saved — syncing to the cloud now.`
            : "You're offline. Every tap is saved here and will sync when you reconnect."}
        </Text>
        {stuck && matchOutbox.syncError(matchId) ? (
          <Text style={st.syncErr} numberOfLines={2}>{matchOutbox.syncError(matchId)}</Text>
        ) : null}
      </View>
      {pending > 0 && (
        <TouchableOpacity style={st.syncBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={stuck ? 'Retry sync' : 'Sync now'} onPress={() => void matchOutbox.flush(matchId, true)}>
          <Text style={st.syncBtnText}>{stuck ? 'Retry' : 'Sync now'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Compact append-only audit trail for a dispute — every step with who & when. */
/** A coloured status pill for a dispute box header. */
function DisputeTag({ kind }: { kind: 'reported' | 'open' | 'resolved' | 'dismissed' }) {
  const map = {
    reported: { label: 'REPORTED', bg: theme.colors.accent, fg: '#0B0F14' },
    open: { label: 'UNDER REVIEW', bg: theme.colors.danger, fg: '#fff' },
    resolved: { label: 'RESOLVED', bg: theme.colors.primary, fg: '#0B0F14' },
    dismissed: { label: 'DISMISSED', bg: theme.colors.surface, fg: theme.colors.textMuted },
  }[kind];
  return <View style={[st.dtag, { backgroundColor: map.bg }]}><Text style={[st.dtagText, { color: map.fg }]}>{map.label}</Text></View>;
}

function DisputeHistory({ events }: { events?: DisputeEvent[] }) {
  if (!events?.length) return null;
  const icon = (a: DisputeEvent['action']) =>
    a === 'resolved' ? '✅' : a === 'dismissed' ? '✕' : a === 'escalated' ? '⏫'
    : a === 'confirmed' ? '☑️' : a === 'proposed' ? '✎' : '🚩';
  return (
    <View style={st.dispHist}>
      <Text style={st.dispHistTitle}>🧾 Audit trail</Text>
      {events.map((e, i) => (
        <View key={i} style={st.dispHistRow}>
          <Text style={st.dispHistIcon}>{icon(e.action)}</Text>
          <Text style={st.dispHistLine}>{e.note ?? e.action}{e.byName ? ` · ${e.byName}` : ''}</Text>
          <Text style={st.dispHistAt}>{new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  dispHist: { marginTop: theme.spacing(1), paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing(1) },
  dispHistTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  dispHistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  dispHistIcon: { fontSize: 12, width: 18, textAlign: 'center' },
  dispHistLine: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  dispHistAt: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    borderRadius: theme.radius.md, borderWidth: 1,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4),
    marginBottom: theme.spacing(3),
  },
  syncOffline: { backgroundColor: theme.colors.accent + '22', borderColor: theme.colors.accent },
  syncPending: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  syncTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  syncErr: { color: theme.colors.danger, fontSize: theme.font.small, marginTop: theme.spacing(1) },
  syncSub: { color: theme.colors.textMuted, fontSize: theme.font.small, marginTop: 2 },
  syncBtn: {
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(4),
  },
  syncBtnText: { color: '#06120D', fontWeight: '800', fontSize: theme.font.small },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabBar: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  tab: { flex: 1, paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, alignItems: 'center' },
  tabScroll: { gap: theme.spacing(1), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  tabChip: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(4), borderRadius: theme.radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tabTextActive: { color: '#06120D', fontWeight: '800' },
  infoCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), gap: theme.spacing(2), ...theme.shadow.card },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(3), paddingVertical: theme.spacing(1) },
  infoLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  infoIcon: { fontSize: 15, width: 18, textAlign: 'center' },
  infoValue: { flexShrink: 1, textAlign: 'right' },
  squadHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', width: 18, textAlign: 'center' },
  venueLink: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2),
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(2.5), paddingHorizontal: theme.spacing(4),
  },
  undoText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  undoHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  sportName: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  squadRow: { gap: theme.spacing(2) },
  squadBtns: { flexDirection: 'row', gap: theme.spacing(2) },
  scorerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  scorerIcon: { fontSize: 16 },
  scorerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  scorerAvatarText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  scorerLive: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.danger },
  scorerLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  scorerLiveText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 1 },
  streamHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streamPill: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary },
  streamDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#0B0F14' },
  streamPillText: { color: '#0B0F14', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 1 },
  streamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  streamPlatform: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  scorerPicker: { marginTop: theme.spacing(2), gap: theme.spacing(1) },
  scorerOpt: { paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  scorerOptText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  assignBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(5) },
  assignBtnText: { color: '#06120D', fontSize: theme.font.body, fontWeight: '800' },
  remindBtn: { backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  remindText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  lineups: { gap: theme.spacing(3) },
  lineupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: 1 },
  squadSection: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: theme.spacing(2), marginBottom: theme.spacing(1) },
  jersey: { width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  jerseyNum: { fontSize: theme.font.small, fontWeight: '900' },
  roleTag: { minWidth: 18, height: 18, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  roleCaptain: { backgroundColor: theme.colors.accent },
  roleTagText: { color: theme.colors.text, fontSize: theme.font.tiny, fontWeight: '900' },
  roleTagTextDark: { color: '#0B0F14' },
  disputedName: { color: theme.colors.danger, fontWeight: '800', textDecorationLine: 'line-through' },
  objectLink: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  disputeBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3), marginTop: theme.spacing(2) },
  disputeCount: { paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.danger },
  disputeCountText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  disputeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dtag: { paddingVertical: 2, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill },
  dtagText: { fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  disputeBanner: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.danger, padding: theme.spacing(3) },
  disputeBannerText: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  controls: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    ...theme.shadow.card,
  },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  eligNote: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  finalCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(4), alignItems: 'center', gap: theme.spacing(2), ...theme.shadow.card,
  },
  finalLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 1 },
  finalRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  finalScore: { fontSize: theme.font.h1, fontWeight: '900' },
  finalVs: { color: theme.colors.textMuted, fontSize: theme.font.small },
  finalResult: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
