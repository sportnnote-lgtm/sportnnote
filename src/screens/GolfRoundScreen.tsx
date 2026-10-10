/** A golf round (stroke play / Stableford): the marker's scorecard — one hole at a
 *  time, the whole group on screen, every player starting at par with big − / +
 *  — plus the live leaderboard. Card saves are offline-safe (data/golf outbox).
 *  See docs/sports/GOLF_DESIGN.md §6. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { confirmMatchAction, askConfirm } from '../components/ConfirmSheet';
import { GolfEntryAdminSheet } from '../components/golf/GolfEntryAdminSheet';
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
  setEntryAdmin, updateFieldEntry, removeFieldEntry, updateFieldEventFormat, entryStatusOf, entryAdminOf, adminLabel, withAdmin, prizeBoards,
  getFieldEntries,
} from '../data/golf';
import {
  summarize, toParLabel, cardSigned, clampPutts, cardHasDetail, derivedGir, MAX_HOLE_STROKES,
  type GolfCard, type HoleScore, type EntryAdmin, type FairwayDir,
} from '../sports/golf/engine';
import type { FieldEntry } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** SD-45 (D8) — the per-hole stats row is off by default and remembered per
 *  scorer (this phone), like the other detail modes. */
const STATS_ROW_KEY = 'sportfolio.golfStatsRow.v1';

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
  const [statsRow, setStatsRow] = useState(false);
  const [adminFor, setAdminFor] = useState<string | null>(null); // SD-35 entry id
  useEffect(() => {
    AsyncStorage.getItem(STATS_ROW_KEY).then((v) => { if (v === '1') setStatsRow(true); }).catch(() => {});
  }, []);
  const toggleStatsRow = () => {
    const next = !statsRow;
    setStatsRow(next);
    AsyncStorage.setItem(STATS_ROW_KEY, next ? '1' : '0').catch(() => {});
  };
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

  const merged = useMemo(() => entries.map((e) => (local.has(e.id) ? { ...e, result: local.get(e.id) } : e)), [entries, local]);
  const board = useMemo(() => (ev && course ? buildLeaderboard([ev], merged, [course]) : []), [ev, course, merged]);
  // SD-66 — Best Gross / Best Net side by side (stroke play with handicaps)
  const prizes = useMemo(() => {
    if (!ev || !course || golfFormatOf(ev).scoring !== 'stroke' || !entries.some((e) => e.handicapIndex != null)) return null;
    return prizeBoards(buildLeaderboard([ev], merged, [course], { net: false }), buildLeaderboard([ev], merged, [course], { net: true }), undefined, golfFormatOf(ev).prizes);
  }, [ev, course, merged, entries]);

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
    const card: GolfCard = withDetail({ ...cur, strokes: [...cur.strokes] }, n);
    card.strokes[hole] = value;
    if (putts !== undefined) {
      card.putts = [...(cur.putts ?? new Array(n).fill(null))];
      card.putts[hole] = putts;
    }
    // SD-117c — putts never exceed the strokes (a lowered score clamps them;
    // a pick-up / cleared hole drops them)
    if (card.putts && card.putts[hole] != null) {
      card.putts = [...card.putts];
      card.putts[hole] = typeof value === 'number' ? clampPutts(card.putts[hole], value) : null;
    }
    // SD-117c — a changed score un-signs the card: they certified it as it stood
    if (cur.strokes[hole] !== value) delete card.signed;
    setLocal((m) => new Map(m).set(e.id, card));
    try { setPendingSync(await saveCard(e.id, card)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); }
  };

  // SD-45 — in stats mode a card carries the stats-row arrays (so GIR,
  // scrambling … are derived from it); older / non-stats cards stay as they are.
  function withDetail(card: GolfCard, n: number): GolfCard {
    if (!statsRow || cardHasDetail(card)) return card;
    return { ...card, firDir: new Array(n).fill(null), bunker: new Array(n).fill(null) };
  }
  const setDetail = async (e: FieldEntry, patch: (c: GolfCard, n: number) => GolfCard) => {
    if (!canMark || ev.status === 'completed') return;
    tapFeedback();
    const n = holes.length;
    const card = patch(withDetail({ ...cardFor(e, n) }, n), n);
    setLocal((m) => new Map(m).set(e.id, card));
    try { setPendingSync(await saveCard(e.id, card)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); }
  };
  const setFairway = (e: FieldEntry, d: FairwayDir) => setDetail(e, (c, n) => {
    const firDir = [...(c.firDir ?? new Array(n).fill(null))];
    firDir[hole] = firDir[hole] === d ? null : d;
    return { ...c, firDir };
  });
  const toggleBunker = (e: FieldEntry) => setDetail(e, (c, n) => {
    const bunker = [...(c.bunker ?? new Array(n).fill(null))];
    bunker[hole] = bunker[hole] ? null : true;
    return { ...c, bunker };
  });
  const stepPenalty = (e: FieldEntry, by: 1 | -1) => setDetail(e, (c, n) => {
    const penalties = [...(c.penalties ?? new Array(n).fill(null))];
    const next = Math.max(0, (penalties[hole] ?? 0) + by);
    penalties[hole] = next || null;
    return { ...c, penalties };
  });

  /* ---------------------- SD-35 entry admin (organiser) --------------------- */
  const adminEntry = adminFor ? entries.find((e) => e.id === adminFor) : undefined;
  const openAdminForPlayer = (playerId: string) => {
    const e = entries.find((x) => x.playerId === playerId);
    if (e && isHost) setAdminFor(e.id);
  };
  const saveAdmin = async (e: FieldEntry, admin: EntryAdmin | null) => {
    const n = holes.length;
    const res = withAdmin(cardFor(e, n), admin, ev.status === 'completed');
    setLocal((m) => new Map(m).set(e.id, res.card));
    setPendingSync(await setEntryAdmin({ ...e, result: cardFor(e, n) }, n, admin, ev.status === 'completed'));
    await reload();
  };
  // A closed round's stat lines and winner are rewritten after a change.
  const refinish = async () => {
    const fresh = await getFieldEntries([ev.id]);
    await completeRound(ev, fresh, course);
  };
  const saveHandicap = async (e: FieldEntry, index: number | undefined) => {
    await updateFieldEntry(e.id, { handicapIndex: index ?? null });
    if (ev.status === 'completed') await refinish();
    await reload();
  };
  const removeEntry = async (e: FieldEntry) => {
    setAdminFor(null);
    const ok = await askConfirm({
      title: `Remove ${nameOf(e.playerId)}?`,
      message: `Their card for this round${cardFor(e, holes.length).strokes.some((x) => x != null) ? ' (and every score on it)' : ''} is deleted. To keep the scores, mark them WD instead.`,
      yesLabel: 'Yes, remove', noLabel: 'No, keep them', tone: 'danger',
    });
    if (!ok) return;
    try {
      await removeFieldEntry(e.id);
      setLocal((m) => { const x = new Map(m); x.delete(e.id); return x; });
      if (ev.status === 'completed') await refinish();
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove'); }
  };
  // SD-89 — the host records who won the playoff for first
  const setPlayoffWinner = async (playerId: string | null) => {
    try {
      await updateFieldEventFormat(ev.id, { playoffWinner: playerId ?? '' });
      if (ev.status === 'completed') { const fresh = await getFieldEntries([ev.id]); await completeRound({ ...ev, format: { ...ev.format, playoffWinner: playerId ?? '' } }, fresh, course); }
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); }
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

  // SD-117c (Rule 3.3b) — the marker and the player each certify the card
  const toggleSign = async (e: FieldEntry, who: 'marker' | 'player') => {
    if (!canMark || ev.status === 'completed') return;
    tapFeedback();
    const cur = cardFor(e, holes.length);
    const signed = { ...cur.signed, [who]: !cur.signed?.[who] };
    const card: GolfCard = { ...cur, signed };
    setLocal((m) => new Map(m).set(e.id, card));
    try { setPendingSync(await saveCard(e.id, card)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); }
  };

  const start = async () => {
    setBusy(true);
    try { await setFieldEventStatus(ev.id, 'live'); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start'); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    const unfinished = board.filter((r) => r.thru < holes.length && r.position != null).length;
    // SD-117c — flag cards the marker and player haven't both signed
    const unsigned = entries.filter((e) => e.status !== 'wd' && e.status !== 'dq' && e.status !== 'dnf' && !cardSigned(cardFor(e, holes.length))).map((e) => nameOf(e.playerId));
    const notes = [
      unfinished ? `${unfinished} player(s) haven't completed every hole. Their cards will count as they stand.` : '',
      unsigned.length ? `${unsigned.length} card(s) not signed by both marker and player: ${unsigned.slice(0, 6).join(', ')}${unsigned.length > 6 ? '…' : ''}.` : '',
    ].filter(Boolean);
    const ok = await confirmMatchAction('finishRound', notes.length ? { detail: notes.join(' ') } : undefined);
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
              // SD-35 — a withdrawn / disqualified / DNS player's card is closed
              const est = entryStatusOf({ ...e, result: card });
              const out = est === 'wd' || est === 'dq' || est === 'dns' || est === 'dnf';
              const adm = entryAdminOf({ ...e, result: card });
              const adminBtn = isHost ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Entry admin for ${nameOf(e.playerId)}: withdraw, disqualify, handicap or remove`} hitSlop={8} onPress={() => setAdminFor(e.id)} style={st.moreBtn}>
                  <Text style={st.moreTxt}>⋯</Text>
                </TouchableOpacity>
              ) : null;
              if (out) {
                return (
                  <Card key={e.id} style={{ gap: theme.spacing(1) }}>
                    <View style={st.headRow}>
                      <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={1}>{nameOf(e.playerId)}</Text>
                      <Pill label={est.toUpperCase()} color={theme.colors.surfaceAlt} textColor={theme.colors.danger} />
                      {adminBtn}
                    </View>
                    <Text style={textStyles.muted}>{adm ? adminLabel(adm) : est.toUpperCase()} · {est === 'dns' ? 'did not start' : 'no score returned'}{isHost ? ' — ⋯ to reinstate' : ''}</Text>
                  </Card>
                );
              }
              const pv = card.putts?.[hole];
              const gir = derivedGir(v, pv, par);
              return (
                <Card key={e.id} style={{ gap: theme.spacing(2) }}>
                  <View style={st.headRow}>
                    <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={1}>{nameOf(e.playerId)}{recv > 0 ? `  ${'•'.repeat(recv)}` : ''}</Text>
                    <Text style={textStyles.muted}>{runLabel} · thru {sum.thru}</Text>
                    {adminBtn}
                  </View>
                  <View style={st.scoreRow}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`One fewer stroke for ${nameOf(e.playerId)}`} disabled={!canMark} onPress={() => set(typeof v === 'number' ? Math.max(1, v - 1) : par - 1)} style={st.stepBtn}>
                      <Text style={st.stepTxt}>−</Text>
                    </TouchableOpacity>
                    <View style={st.valueBox}>
                      <Text style={[st.value, typeof v === 'number' && v < par && st.under, typeof v === 'number' && v > par && st.over]}>{v == null ? '–' : v}</Text>
                      <Text style={st.valueSub}>{typeof v === 'number' ? (v - par === 0 ? 'par' : v - par < 0 ? `${v - par === -1 ? 'birdie' : v - par === -2 ? 'eagle' : `${v - par}`}` : `${v - par === 1 ? 'bogey' : v - par === 2 ? 'double' : `+${v - par}`}`) : v === 'P' ? 'picked up' : ''}</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`One more stroke for ${nameOf(e.playerId)}`} disabled={!canMark} onPress={() => set(typeof v === 'number' ? Math.min(MAX_HOLE_STROKES, v + 1) : par + 1)} style={st.stepBtn}>
                      <Text style={st.stepTxt}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={st.tabs}>
                    <SelectChip label="Par" active={v === par} onPress={() => canMark && set(par)} />
                    <SelectChip label={fmt.scoring === 'stableford' ? 'Pick up' : 'Pick up (NR)'} active={v === 'P'} onPress={() => canMark && void pickUp(e, v)} />
                    {v != null && <SelectChip label="Clear…" active={false} onPress={() => canMark && void clearHole(e)} />}
                  </View>
                  {(trackPutts || statsRow) && typeof v === 'number' && (() => {
                    // SD-117c — 0–4 as chips, then "5+" steps up; never more than the strokes
                    const high = typeof pv === 'number' && pv >= 5;
                    return (
                      <View style={st.tabs}>
                        <Text style={textStyles.muted}>Putts</Text>
                        {[0, 1, 2, 3, 4].filter((p) => p <= v).map((p) => (
                          <SelectChip key={p} label={String(p)} active={pv === p} onPress={() => canMark && void setStroke(e, v, p)} />
                        ))}
                        {v >= 5 && (
                          <SelectChip label={high ? `${pv} ＋` : '5+'} active={high}
                            onPress={() => canMark && void setStroke(e, v, high ? Math.min(v, (pv as number) + 1) : 5)} />
                        )}
                      </View>
                    );
                  })()}
                  {/* SD-45 — the stats row: fairway (par 4 / 5), greenside bunker,
                      penalty strokes; GIR from strokes − putts ≤ par − 2 */}
                  {statsRow && typeof v === 'number' && (
                    <View style={st.tabs}>
                      {par >= 4 && (
                        <>
                          <Text style={textStyles.muted}>FW</Text>
                          {(['L', 'hit', 'R'] as FairwayDir[]).map((d) => (
                            <SelectChip key={d} label={d === 'L' ? '◀ L' : d === 'R' ? 'R ▶' : '✓'} active={card.firDir?.[hole] === d}
                              onPress={() => canMark && void setFairway(e, d)} />
                          ))}
                        </>
                      )}
                      <SelectChip label="⛱ Bunker" active={card.bunker?.[hole] === true} onPress={() => canMark && void toggleBunker(e)} />
                      <SelectChip label={`Pen ${card.penalties?.[hole] ?? 0}`} active={(card.penalties?.[hole] ?? 0) > 0} onPress={() => canMark && void stepPenalty(e, 1)} />
                      {(card.penalties?.[hole] ?? 0) > 0 && <SelectChip label="−" active={false} onPress={() => canMark && void stepPenalty(e, -1)} />}
                      <Text style={[textStyles.muted, gir && st.girHit]}>{gir == null ? 'GIR: add putts' : gir ? 'GIR ✓' : 'GIR ✗'}</Text>
                    </View>
                  )}
                  {/* SD-117c (Rule 3.3b) — certify the card once every hole has a score */}
                  {sum.thru >= holes.length ? (
                    <View style={st.tabs}>
                      <Text style={[textStyles.muted, !cardSigned(card) && st.unsigned]}>{cardSigned(card) ? '✍ Card signed' : '✍ Sign the card'}</Text>
                      <SelectChip label={card.signed?.marker ? 'Marker ✓' : 'Marker'} active={!!card.signed?.marker} onPress={() => void toggleSign(e, 'marker')} />
                      <SelectChip label={card.signed?.player ? 'Player ✓' : 'Player'} active={!!card.signed?.player} onPress={() => void toggleSign(e, 'player')} />
                    </View>
                  ) : null}
                </Card>
              );
            })}

            <View style={st.tabs}>
              <SelectChip label={trackPutts || statsRow ? '✓ Tracking putts' : 'Track putts'} active={trackPutts || statsRow} onPress={() => !statsRow && setTrackPutts(!trackPutts)} />
              {/* SD-45 — remembered on this phone; off by default (D8) */}
              <SelectChip label={statsRow ? '✓ Stats: fairway · bunker · penalties' : 'Stats: fairway · bunker · penalties'} active={statsRow} onPress={toggleStatsRow} />
            </View>
            {hole < holes.length - 1 && <Button label={`Next: hole ${holes[hole + 1].n} ▶`} onPress={() => setHole(hole + 1)} />}
            {ev.status === 'live' && isHost && <Button label={busy ? 'Finishing…' : '🏁 Finish the round'} variant="ghost" onPress={() => void finish()} disabled={busy} />}
          </>
        )}

        {tab === 'board' && (
          <>
            <GolfLeaderboard rows={board} scoring={fmt.scoring} nameOf={nameOf} cards={lbCards} holesInRound={holes.length}
              onLongPressRow={isHost ? openAdminForPlayer : undefined} />
            <Text style={textStyles.muted}>
              {fmt.scoring === 'stableford' ? 'Most points wins.' : `Lowest ${fmt.net ? 'net ' : ''}score to par wins.`} Ties: {fmt.tieBreak === 'countback' ? 'countback on the last 9, 6, 3, 1 holes' : fmt.tieBreak === 'playoff' ? 'a playoff for first; other places shared' : 'shared'}. Tap a player to see their card{isHost ? '; long-press for WD / DQ / DNS, handicap or remove' : ''}.
            </Text>
            {/* SD-89 — the host records the playoff winner */}
            {fmt.tieBreak === 'playoff' && board.some((r) => r.playoff) && (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={[textStyles.body, st.bold]}>🏌️ Playoff for 1st</Text>
                {board.some((r) => r.playoff === 'pending')
                  ? <Text style={textStyles.muted}>Tied for first — {board.filter((r) => r.playoff).map((r) => nameOf(r.id)).join(' / ')}. {isHost ? 'Who won the playoff?' : 'Playoff pending.'}</Text>
                  : <Text style={textStyles.muted}>Won by {nameOf(board.find((r) => r.playoff === 'won')!.id)}.</Text>}
                {isHost && (
                  <View style={st.tabs}>
                    {board.filter((r) => r.playoff).map((r) => (
                      <SelectChip key={r.id} label={nameOf(r.id)} active={r.playoff === 'won'} onPress={() => void setPlayoffWinner(r.playoff === 'won' ? null : r.id)} />
                    ))}
                  </View>
                )}
              </Card>
            )}
            {/* SD-66 — Best Gross / Best Net side by side */}
            {prizes && (prizes.gross.length > 0 || prizes.net.length > 0) && (
              <View style={st.prizes}>
                {([['Best gross', prizes.gross], ['Best net', prizes.net]] as const).map(([title, rows]) => (
                  <Card key={title} style={[st.prizeCol, { gap: theme.spacing(1) }]}>
                    <Text style={[textStyles.body, st.bold]}>{title}</Text>
                    {rows.length ? rows.map((r) => (
                      <View key={r.id} style={st.headRow}>
                        <Text style={st.prizePos}>{r.positionLabel}</Text>
                        <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{nameOf(r.id)}</Text>
                        <Text style={st.prizeScore}>{toParLabel(r.total)}</Text>
                      </View>
                    )) : <Text style={textStyles.muted}>—</Text>}
                  </Card>
                ))}
              </View>
            )}
            {prizes && prizes.gross.length > 0 && fmt.prizes === 'one' ? <Text style={textStyles.muted}>One prize per player: a gross prize-winner is left off the net board.</Text> : null}
            {ev.status === 'completed' && ev.tournamentId && isHost && (
              <Button label="＋ Set up the next round" variant="ghost" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId: ev.tournamentId, nextOf: ev.id })} />
            )}
          </>
        )}
      </ScrollView>
      {adminEntry && (
        <GolfEntryAdminSheet
          visible={!!adminEntry}
          name={nameOf(adminEntry.playerId)}
          status={entryStatusOf({ ...adminEntry, result: cardFor(adminEntry, holes.length) })}
          admin={entryAdminOf({ ...adminEntry, result: cardFor(adminEntry, holes.length) })}
          thru={summarize(cardFor(adminEntry, holes.length), holes, ctxByEntry.get(adminEntry.id)?.received ?? []).thru}
          handicapIndex={adminEntry.handicapIndex ?? undefined}
          roundState={ev.status === 'completed' ? 'completed' : ev.status === 'live' ? 'live' : 'scheduled'}
          onClose={() => setAdminFor(null)}
          onStatus={(a) => saveAdmin(adminEntry, a)}
          onHandicap={(i) => saveHandicap(adminEntry, i)}
          onRemove={() => void removeEntry(adminEntry)}
        />
      )}
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
  unsigned: { color: theme.colors.accent, fontWeight: '800' },
  moreBtn: { paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  moreTxt: { color: theme.colors.primary, fontSize: 22, fontWeight: '900' },
  girHit: { color: theme.colors.primary, fontWeight: '800' },
  prizes: { flexDirection: 'row', gap: theme.spacing(2) },
  prizeCol: { flex: 1 },
  prizeScore: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  prizePos: { width: 26, color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small },
});
