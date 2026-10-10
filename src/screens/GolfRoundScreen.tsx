/** A golf round (stroke play / Stableford): the marker's scorecard — one hole at a
 *  time, the whole group on screen, every player starting at par with big − / +
 *  — plus the live leaderboard. Card saves are offline-safe (data/golf outbox).
 *  See docs/sports/GOLF_DESIGN.md §6. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { confirmMatchAction } from '../components/ConfirmSheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useKeepAwakeWhile } from '../core/keepAwake';
import { tapFeedback } from '../core/haptics';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, Pill, SelectChip, FormError, textStyles } from '../components/ui';
import { GolfLeaderboard, type LeaderboardCard } from '../components/golf/GolfLeaderboard';
import { useAuth } from '../core/auth';
import { shareMessage } from '../core/share';
import { golfShareText } from '../core/shareText';
import { getMyPlayerId } from '../data/repos';
import { useGolfRounds } from '../data/useGolf';
import {
  golfFormatOf, roundContext, cardOf, saveCard, buildLeaderboard, completeRound, setFieldEventStatus, pendingCardCount,
} from '../data/golf';
import { summarize, toParLabel, type GolfCard, type HoleScore } from '../sports/golf/engine';
import type { FieldEntry } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GolfRoundScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GolfRound'>>();
  const { profile } = useAuth();
  const { events, entries, courses, players, loading, reload } = useGolfRounds({ eventId: params.eventId });
  const ev = events[0];
  const fmt = ev ? golfFormatOf(ev) : null;
  const course = ev && fmt ? courses.find((c) => c.id === fmt.courseId) : undefined;

  const [tab, setTab] = useParamState<'card' | 'board'>('tab', 'card');
  const [me, setMe] = useState<string | null>(null);
  const [group, setGroup] = useState<number | null>(null);
  const [hole, setHole] = useState(0);
  const [trackPutts, setTrackPutts] = useState(false);
  const [local, setLocal] = useState<Map<string, GolfCard>>(new Map()); // optimistic cards
  const [pendingSync, setPendingSync] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getMyPlayerId(profile?.id).then(setMe); }, [profile?.id]);

  const groups = useMemo(() => [...new Set(entries.map((e) => e.groupNo))].sort((a, b) => a - b), [entries]);
  const myGroup = entries.find((e) => e.playerId === me)?.groupNo;
  const activeGroup = group ?? myGroup ?? groups[0] ?? 1;
  const isHost = !!me && !!ev && ((ev.hostIds ?? []).includes(me) || ev.createdBy === profile?.id);
  const canMark = isHost || myGroup === activeGroup;
  const nameOf = (pid: string) => players.get(pid)?.fullName ?? 'Player';

  // Effective cards: optimistic local edits over what was loaded.
  const cardFor = (e: FieldEntry, n: number) => local.get(e.id) ?? cardOf(e, n);

  const ctxByEntry = useMemo(() => {
    const m = new Map<string, ReturnType<typeof roundContext>>();
    if (ev && course) for (const e of entries) m.set(e.id, roundContext(ev, course, e));
    return m;
  }, [ev, course, entries]);

  const board = useMemo(() => {
    if (!ev || !course) return [];
    const merged = entries.map((e) => (local.has(e.id) ? { ...e, result: local.get(e.id) } : e));
    return buildLeaderboard([ev], merged, [course]);
  }, [ev, course, entries, local]);

  // Title + a Share button that sends the current top of the leaderboard.
  useEffect(() => {
    if (!ev) return;
    const stableford = golfFormatOf(ev).scoring === 'stableford';
    const share = () => void shareMessage(golfShareText({
      title: ev.title,
      final: ev.status === 'completed',
      eventId: ev.id,
      leaders: board.slice(0, 5).map((r) => {
        const score = stableford ? `${r.total} pts` : toParLabel(r.total);
        const thru = ev.status !== 'completed' && r.thru > 0 && r.thru < 18 ? ` (thru ${r.thru})` : '';
        return `${r.positionLabel}. ${nameOf(r.id)} ${score}${thru}`;
      }),
    }), 'golf');
    nav.setOptions({
      title: ev.title,
      headerRight: () => (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share this round" onPress={share} hitSlop={10} style={{ paddingHorizontal: theme.spacing(2) }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.body }}>Share</Text>
        </TouchableOpacity>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, ev, board]);

  // SD-110 — keep the marker's phone awake on the scorecard of a live round.
  const focused = useIsFocused();
  useKeepAwakeWhile(focused && canMark && ev?.status === 'live' && tab === 'card');

  if (loading) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, st.pad]}>Loading round…</Text></SafeAreaView>;
  if (!ev || !course || !fmt) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, st.pad]}>Round not found.</Text></SafeAreaView>;

  const holes = ctxByEntry.values().next().value?.holes ?? [];
  const h = holes[hole];
  const groupEntries = entries.filter((e) => e.groupNo === activeGroup);

  const setStroke = async (e: FieldEntry, value: HoleScore, putts?: number | null) => {
    if (!canMark || ev.status === 'completed') return;
    tapFeedback(); // SD-110
    const n = holes.length;
    const cur = cardFor(e, n);
    const card: GolfCard = { ...cur, strokes: [...cur.strokes] };
    card.strokes[hole] = value;
    if (putts !== undefined) {
      card.putts = [...(cur.putts ?? new Array(n).fill(null))];
      card.putts[hole] = putts;
    }
    setLocal((m) => new Map(m).set(e.id, card));
    try { setPendingSync(await saveCard(e.id, card)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); }
  };

  // SD-116: in stroke play a pick-up makes the whole card a no return (NR), so
  // it asks first (Stableford: a pick-up is just 0 points on the hole).
  const pickUp = async (e: FieldEntry, v: HoleScore) => {
    if (v === 'P') { await setStroke(e, null); return; }
    if (fmt.scoring !== 'stableford' && !(await confirmMatchAction('pickUp', { what: `${nameOf(e.playerId)} on hole ${h.n}` }))) return;
    await setStroke(e, 'P');
  };
  // SD-116: Clear wipes the hole (the round screen has no undo) — it asks first.
  const clearHole = async (e: FieldEntry) => {
    if (!(await confirmMatchAction('clearHole', { what: `hole ${h.n} for ${nameOf(e.playerId)}` }))) return;
    await setStroke(e, null);
  };

  const start = async () => {
    setBusy(true);
    try { await setFieldEventStatus(ev.id, 'live'); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start'); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    const unfinished = board.filter((r) => r.thru < holes.length && r.position != null).length;
    const ok = await confirmMatchAction('finishRound', unfinished ? { detail: `${unfinished} player(s) haven't completed every hole. Their cards will count as they stand.` } : undefined);
    if (!ok) return;
    setBusy(true);
    try {
      const merged = entries.map((e) => (local.has(e.id) ? { ...e, result: local.get(e.id) } : e));
      await completeRound(ev, merged, course);
      await reload();
      setTab('board');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not finish'); }
    finally { setBusy(false); }
  };

  const lbCards = new Map<string, LeaderboardCard>();
  for (const e of entries) {
    const c = ctxByEntry.get(e.id);
    if (c) lbCards.set(e.playerId, { holes: c.holes, card: cardFor(e, c.holes.length), received: c.received });
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={st.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h3}>⛳ {ev.title}</Text>
            <Text style={textStyles.muted}>
              {course.name} · {fmt.scoring === 'stableford' ? 'Stableford' : fmt.net ? 'Stroke play (net)' : 'Stroke play'} · {holes.length} holes
            </Text>
          </View>
          <Pill
            label={ev.status === 'live' ? 'LIVE' : ev.status === 'completed' ? 'FINAL' : 'UPCOMING'}
            color={ev.status === 'live' ? theme.colors.danger : theme.colors.surfaceAlt}
            textColor={ev.status === 'live' ? '#fff' : theme.colors.textMuted}
          />
        </View>

        <View style={st.tabs}>
          <SelectChip label="📝 Scorecard" active={tab === 'card'} onPress={() => setTab('card')} />
          <SelectChip label="🏆 Leaderboard" active={tab === 'board'} onPress={() => setTab('board')} />
        </View>

        <FormError message={error} />
        {pendingSync > 0 || pendingCardCount() > 0 ? (
          <Text style={st.sync}>⚠️ {Math.max(pendingSync, pendingCardCount())} card(s) saved on this phone — syncing when you're back online.</Text>
        ) : null}

        {tab === 'card' && (
          <>
            {ev.status === 'scheduled' && isHost && <Button label={busy ? 'Starting…' : '▶ Start the round'} onPress={start} disabled={busy} />}
            {groups.length > 1 && (
              <View style={st.tabs}>
                {groups.map((g) => (
                  <SelectChip key={g} label={`Group ${g}${g === myGroup ? ' (you)' : ''}`} active={g === activeGroup} onPress={() => setGroup(g)} />
                ))}
              </View>
            )}
            {!canMark && <Text style={textStyles.muted}>View only — the group's players and the organizer keep this card.</Text>}

            <View style={st.holeNav}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous hole" disabled={hole === 0} onPress={() => setHole(hole - 1)} style={st.navBtn}>
                <Text style={[st.navTxt, hole === 0 && st.dim]}>◀</Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={st.holeNo}>Hole {h?.n}</Text>
                <Text style={textStyles.muted}>Par {h?.par} · SI {h?.si}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next hole" disabled={hole >= holes.length - 1} onPress={() => setHole(hole + 1)} style={st.navBtn}>
                <Text style={[st.navTxt, hole >= holes.length - 1 && st.dim]}>▶</Text>
              </TouchableOpacity>
            </View>
            <View style={st.dots}>
              {holes.map((x, i) => {
                const done = groupEntries.length > 0 && groupEntries.every((e) => cardFor(e, holes.length).strokes[i] != null);
                return <TouchableOpacity key={x.n} accessibilityLabel={`Go to hole ${x.n}`} onPress={() => setHole(i)}><View style={[st.dot, done && st.dotDone, i === hole && st.dotHere]} /></TouchableOpacity>;
              })}
            </View>

            {groupEntries.map((e) => {
              const ctx = ctxByEntry.get(e.id)!;
              const card = cardFor(e, holes.length);
              const v = card.strokes[hole];
              const recv = ctx.received[hole] ?? 0;
              const sum = summarize(card, ctx.holes, ctx.received);
              const runLabel = fmt.scoring === 'stableford' ? `${sum.stableford} pts` : toParLabel(fmt.net ? sum.netToPar : sum.toPar);
              const par = h.par;
              const set = (x: HoleScore) => void setStroke(e, x);
              return (
                <Card key={e.id} style={{ gap: theme.spacing(2) }}>
                  <View style={st.headRow}>
                    <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={1}>{nameOf(e.playerId)}{recv > 0 ? `  ${'•'.repeat(recv)}` : ''}</Text>
                    <Text style={textStyles.muted}>{runLabel} · thru {sum.thru}</Text>
                  </View>
                  <View style={st.scoreRow}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`One fewer stroke for ${nameOf(e.playerId)}`} disabled={!canMark} onPress={() => set(typeof v === 'number' ? Math.max(1, v - 1) : par - 1)} style={st.stepBtn}>
                      <Text style={st.stepTxt}>−</Text>
                    </TouchableOpacity>
                    <View style={st.valueBox}>
                      <Text style={[st.value, typeof v === 'number' && v < par && st.under, typeof v === 'number' && v > par && st.over]}>{v == null ? '–' : v}</Text>
                      <Text style={st.valueSub}>{typeof v === 'number' ? (v - par === 0 ? 'par' : v - par < 0 ? `${v - par === -1 ? 'birdie' : v - par === -2 ? 'eagle' : `${v - par}`}` : `${v - par === 1 ? 'bogey' : v - par === 2 ? 'double' : `+${v - par}`}`) : v === 'P' ? 'picked up' : ''}</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`One more stroke for ${nameOf(e.playerId)}`} disabled={!canMark} onPress={() => set(typeof v === 'number' ? Math.min(15, v + 1) : par + 1)} style={st.stepBtn}>
                      <Text style={st.stepTxt}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={st.tabs}>
                    <SelectChip label="Par" active={v === par} onPress={() => canMark && set(par)} />
                    <SelectChip label={fmt.scoring === 'stableford' ? 'Pick up' : 'Pick up (NR)'} active={v === 'P'} onPress={() => canMark && void pickUp(e, v)} />
                    {v != null && <SelectChip label="Clear…" active={false} onPress={() => canMark && void clearHole(e)} />}
                  </View>
                  {trackPutts && typeof v === 'number' && (
                    <View style={st.tabs}>
                      <Text style={textStyles.muted}>Putts</Text>
                      {[0, 1, 2, 3, 4].map((p) => (
                        <SelectChip key={p} label={String(p)} active={card.putts?.[hole] === p} onPress={() => canMark && void setStroke(e, v, p)} />
                      ))}
                    </View>
                  )}
                </Card>
              );
            })}

            <SelectChip label={trackPutts ? '✓ Tracking putts' : 'Track putts'} active={trackPutts} onPress={() => setTrackPutts(!trackPutts)} />
            {hole < holes.length - 1 && <Button label={`Next: hole ${holes[hole + 1].n} ▶`} onPress={() => setHole(hole + 1)} />}
            {ev.status === 'live' && isHost && <Button label={busy ? 'Finishing…' : '🏁 Finish the round'} variant="ghost" onPress={() => void finish()} disabled={busy} />}
          </>
        )}

        {tab === 'board' && (
          <>
            <GolfLeaderboard rows={board} scoring={fmt.scoring} nameOf={nameOf} cards={lbCards} holesInRound={holes.length} />
            <Text style={textStyles.muted}>
              {fmt.scoring === 'stableford' ? 'Most points wins.' : `Lowest ${fmt.net ? 'net ' : ''}score to par wins.`} Ties: {fmt.tieBreak === 'countback' ? 'countback on the last 9, 6, 3, 1 holes' : 'shared'}. Tap a player to see their card.
            </Text>
            {ev.status === 'completed' && ev.tournamentId && isHost && (
              <Button label="＋ Set up the next round" variant="ghost" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId: ev.tournamentId, nextOf: ev.id })} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  pad: { padding: theme.spacing(4) },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  bold: { fontWeight: '800' },
  sync: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  holeNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing(2) },
  navBtn: { padding: theme.spacing(3) },
  navTxt: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  dim: { color: theme.colors.border },
  holeNo: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.border },
  dotDone: { backgroundColor: theme.colors.primary },
  dotHere: { borderWidth: 2, borderColor: theme.colors.text },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  stepBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: theme.colors.text, fontSize: 28, fontWeight: '800' },
  valueBox: { flex: 1, alignItems: 'center' },
  value: { color: theme.colors.text, fontSize: 36, fontWeight: '900' },
  valueSub: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  under: { color: theme.colors.primary },
  over: { color: theme.colors.accent },
});
