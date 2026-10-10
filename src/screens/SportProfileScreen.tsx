/** Deep per-sport profile for one player: that sport's stats, match history,
 *  and sport-specific details (e.g. football position/foot/teams, editable on
 *  your own profile). Reached by tapping a sport on the main profile. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, Pill, SelectChip, ScreenTitle, textStyles, Button } from '../components/ui';
import { matchLine } from '../sports/matchLine';
import { getSport } from '../sports/registry';
import { formatDay } from '../core/dates';
import { useAuth } from '../core/auth';
import { usePlayerProfile, useMatches } from '../data/hooks';
import { statCoverage, aggregate } from '../data/stats';
import { contextsFor, splitOptions, filterLines, type SplitDim, type SplitSelection } from '../data/lineContext';
import { lineResult, RESULT_PILL } from '../data/appearances';
import { cricketMatchLine } from '../data/cricketCareer';
import { statSchema, labelLong } from '../sports/statSchemas';
import {
  careerSections, recordFigure, winPctText, tileValueIsLong, bestWinRun, titlesAndFinals,
  disciplineRecords, partnerRecords, doublesMatchIds, historyStats, wlText,
} from '../data/career';
import { golfProfileSummary } from '../sports/golf/engine';
import { AthleticsCareer } from '../components/athletics/AthleticsCareer';
import { LiftingCareer } from '../components/results/LiftingCareer';
import { getMyPlayerId, getPlayerEditAccess, getTournaments, getStatLinesForMatches, getPlayerNames } from '../data/repos';
import type { StatLine, Tournament } from '../core/types';
import type { EditAccess } from '../core/playerEditAccess';
import { SPORT_SIDE_FIELDS } from '../data/sportProfileFields';
import type { RootStackParamList } from '../navigation/types';
import { isGuestSession, promptSignIn } from '../core/guest';
import { ageOf } from '../core/age';



type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SportProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SportProfile'>>();
  const { playerId, sport } = params;
  const { profile, authed } = useAuth();
  const { player, stats: allStats, official, friendly } = usePlayerProfile(playerId);
  const [scope, setScope] = useState<'all' | 'official' | 'friendly'>('all');
  const { matches } = useMatches();
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const plugin = getSport(sport);

  // 'self' = my own profile; 'admin' = an unclaimed player I manage (parity #12).
  const [access, setAccess] = useState<EditAccess>('none');
  const [openStat, setOpenStat] = useState<string | null>(null);

  // SD-25 — split chips (Format · Singles/Doubles · Tournament · Season ·
  // Opponent …). Each line's context is derived from its already-loaded match
  // and tournament; a chip only filters lines and re-runs the aggregates, so
  // switching chips makes no network calls. Tournaments load once.
  const [sel, setSel] = useState<SplitSelection>({});
  const [openDim, setOpenDim] = useState<SplitDim | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  useEffect(() => {
    let on = true;
    getTournaments({ includeDeleted: true }).then((t) => on && setTournaments(t)).catch(() => {});
    return () => { on = false; };
  }, []);
  const tournamentById = useMemo(() => new Map(tournaments.map((t) => [t.id, t])), [tournaments]);
  const baseStats = !allStats || !official || !friendly ? null
    : countInSportOf(allStats, sport) === 0 || scope === 'all' ? allStats : scope === 'official' ? official : friendly;
  const sportLines = useMemo(() => (baseStats?.recent ?? []).filter((l) => l.sport === sport), [baseStats, sport]);
  const ctxOf = useMemo(() => contextsFor(sportLines, matchById, tournamentById), [sportLines, matchById, tournamentById]);
  const splits = useMemo(() => splitOptions(sportLines, ctxOf, statSchema(sport)?.splits ?? []), [sportLines, ctxOf, sport]);
  // Only choices still on offer count (a scope switch can drop a value).
  const activeSel = useMemo(() => {
    const out: SplitSelection = {};
    for (const o of splits) { const k = sel[o.dim]; if (k != null && o.values.some((x) => x.key === k)) out[o.dim] = k; }
    return out;
  }, [splits, sel]);
  const filtered = Object.keys(activeSel).length > 0;
  const splitStats = useMemo(() => (filtered ? aggregate(filterLines(sportLines, ctxOf, activeSel)) : null), [filtered, sportLines, ctxOf, activeSel]);

  // SD-24 — doubles partners: the other lines of the player's doubles matches
  // (one query per profile, not per chip), paired by match + side, and the
  // partners' names.
  const pairIds = useMemo(() => doublesMatchIds(sportLines, ctxOf), [sportLines, ctxOf]);
  const pairKey = pairIds.join(',');
  const [mateLines, setMateLines] = useState<StatLine[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let on = true;
    if (!pairIds.length) { setMateLines([]); return; }
    getStatLinesForMatches(pairIds).then((ls) => on && setMateLines(ls)).catch(() => {});
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairKey]);
  const allPartners = useMemo(() => partnerRecords(sportLines, mateLines, matchById, ctxOf), [sportLines, mateLines, matchById, ctxOf]);
  const partnerKey = allPartners.map((p) => p.partnerId).join(',');
  useEffect(() => {
    let on = true;
    const ids = partnerKey ? partnerKey.split(',') : [];
    getPlayerNames(ids).then((m) => on && setNames(m)).catch(() => {});
    return () => { on = false; };
  }, [partnerKey]);

  // Name the nav bar after whose profile this is, so the header reads as a
  // breadcrumb (⟨ Aarav Mehta) rather than a generic "Sport".
  useEffect(() => {
    if (player) nav.setOptions({ title: player.fullName });
  }, [nav, player?.fullName]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id)
        .then((id) => getPlayerEditAccess(playerId, id))
        .then((a) => on && setAccess(a))
        .catch(() => on && setAccess('none'));
      return () => {
        on = false;
      };
    }, [profile?.id, playerId])
  );

  // Logged-out visitors: adults only (same rule as the profile page).
  const guestAge = player ? ageOf(player) : undefined;
  if (player && isGuestSession(authed) && (guestAge === undefined || guestAge < 18)) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={{ padding: theme.spacing(4), gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>🔒 Members only</Text>
          <Text style={textStyles.muted}>This player’s stats are visible to SportnNote members.</Text>
          <Button label="Join free" onPress={() => promptSignIn('up')} />
        </View>
      </SafeAreaView>
    );
  }

  if (!player || !allStats || !official || !friendly) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text>
      </SafeAreaView>
    );
  }

  // Scope the stats to official / friendly / all. The toggle shows whenever the
  // player has any matches in this sport (consistent placement); an empty scope
  // just says so.
  const countInSport = (s: typeof allStats) => countInSportOf(s, sport);
  const hasSplit = countInSport(allStats) > 0;
  // No split chosen → exactly today's stats; else the filtered lines re-aggregated.
  const stats = splitStats ?? baseStats ?? allStats;

  const bySport = stats.bySport.find((b) => b.sport === sport);
  const emptyMsg = filtered ? 'No matches for these filters.'
    : hasSplit && scope === 'friendly' ? `No friendly ${plugin.name.toLowerCase()} matches yet.`
    : hasSplit && scope === 'official' ? `No official ${plugin.name.toLowerCase()} matches yet.`
    : `No ${plugin.name.toLowerCase()} matches recorded yet.`;
  const history = stats.recent.filter((l) => l.sport === sport);
  const schema = statSchema(sport);
  const detail = player.sportDetails?.[sport];

  // History rows open the full match page when they link to a real match.
  const openMatch = (matchId: string) => {
    const m = matchById.get(matchId);
    if (!m) return;
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: false,
    });
  };
  const sideFields = SPORT_SIDE_FIELDS[sport];
  const hasDetails = !!(detail?.position || detail?.sides || detail?.teams?.length);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title={`${plugin.icon} ${plugin.name}`} />

        {hasSplit && (
          <View style={st.scopeRow}>
            <SelectChip label={`All · ${countInSport(allStats)}`} active={scope === 'all'} onPress={() => setScope('all')} />
            <SelectChip label={`Official · ${countInSport(official)}`} active={scope === 'official'} onPress={() => setScope('official')} />
            <SelectChip label={`Friendly · ${countInSport(friendly)}`} active={scope === 'friendly'} onPress={() => setScope('friendly')} />
          </View>
        )}

        {splits.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
              {splits.map((o) => {
                const cur = o.values.find((x) => x.key === activeSel[o.dim]);
                return (
                  <SelectChip
                    key={o.dim}
                    label={`${o.label}: ${cur?.label ?? 'All'} ${openDim === o.dim ? '▴' : '▾'}`}
                    active={!!cur}
                    onPress={() => setOpenDim(openDim === o.dim ? null : o.dim)}
                  />
                );
              })}
              {filtered && <SelectChip label="✕ Clear" active={false} onPress={() => { setSel({}); setOpenDim(null); }} />}
            </ScrollView>
            {(() => {
              const o = splits.find((x) => x.dim === openDim);
              if (!o) return null;
              const pick = (k?: string) => setSel((p) => ({ ...p, [o.dim]: k }));
              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
                  <SelectChip label="All" active={activeSel[o.dim] == null} onPress={() => pick(undefined)} />
                  {o.values.map((x) => (
                    <SelectChip key={x.key} label={`${x.label} · ${x.count}`} active={activeSel[o.dim] === x.key} onPress={() => pick(x.key)} />
                  ))}
                </ScrollView>
              );
            })()}
          </View>
        )}

        {!bySport ? (
          <EmptyState icon={plugin.icon} title={emptyMsg} compact />
        ) : (
          <>
            {schema?.careerView === 'measured' ? (
              // SD-90 — a timed / measured career: PB / SB per event, medals,
              // finals and the results history (it renders its own history).
              sport === 'weightlifting' ? <LiftingCareer lines={history} /> : <AthleticsCareer lines={history} />
            ) : sport === 'golf' ? (() => {
              // Golf reads in rounds, scoring average and percentages — not
              // matches/wins or raw counters.
              const t = bySport.totals;
              const pct = (hit: number, n: number) => (n ? `${Math.round((hit / n) * 100)}%` : '–');
              const avg = t.completeRounds ? (t.completeStrokes / t.completeRounds).toFixed(1) : '–';
              // Bests compare like for like (18 vs 9 holes); putts/round only
              // over holes where putts were entered (SD-07).
              const g = golfProfileSummary(stats.recent.filter((l) => l.sport === 'golf'));
              return (
                <>
                  <View style={st.statGrid}>
                    <Stat value={String(t.rounds ?? bySport.matches)} label="Rounds" />
                    <Stat value={avg} label="Scoring avg" />
                    <Stat value={g.best18 != null ? String(g.best18) : '–'} label="Best round" />
                  </View>
                  <Text style={st.totalsLabel}>Totals · golf</Text>
                  <View style={st.statGrid}>
                    {g.best9 != null && <Stat value={String(g.best9)} label="Best 9 holes" tone="neutral" />}
                    <Stat value={String(t.eagles ?? 0)} label="Eagles+" tone="neutral" />
                    <Stat value={String(t.birdies ?? 0)} label="Birdies" tone="neutral" />
                    <Stat value={String(t.pars ?? 0)} label="Pars" tone="neutral" />
                    <Stat value={String(bySport.wins)} label="Wins" tone="neutral" />
                    <Stat value={g.puttsPerRound != null ? g.puttsPerRound.toFixed(1) : '–'} label="Putts/round" tone="neutral" />
                    <Stat value={pct(t.girHit ?? 0, t.girHoles ?? 0)} label="Greens (GIR)" tone="neutral" />
                    <Stat value={pct(t.firHit ?? 0, t.firHoles ?? 0)} label="Fairways" tone="neutral" />
                  </View>
                </>
              );
            })() : (
            <>
            {/* Headline record — accent-coloured so the eye lands here first. */}
            {/* SD-11: appearances, the W-D-L record (draws / ties / no results
                are no longer losses) and win % over matches with a result.
                SD-24: W-L where the sport has no draws. */}
            {(() => {
              const rec = recordFigure(sport, bySport);
              const winPct = winPctText(bySport);
              const headLong = [String(bySport.matches), rec.value, winPct].some(tileValueIsLong);
              // SD-24 — best winning run, titles / finals (cricket's header stays as it was)
              const framework = sport !== 'cricket';
              const run = framework ? bestWinRun(history) : 0;
              const tf = framework ? titlesAndFinals(history, matchById) : { titles: 0, finals: 0 };
              const extra = bySport.startsKnown > 0 || bySport.ties > 0 || bySport.noResults > 0 || run >= 2 || tf.finals > 0;
              return (
                <>
                  {/* one font size per row: "100%" (or "12-3") shrinks the whole row */}
                  <View style={st.statGrid}>
                    <Stat value={String(bySport.matches)} label="Apps" long={headLong} />
                    <Stat value={rec.value} label={rec.label} long={headLong} />
                    <Stat value={winPct} label="Win %" long={headLong} />
                  </View>
                  {extra && (
                    <View style={st.statGrid}>
                      {bySport.startsKnown > 0 && <Stat value={String(bySport.starts)} label="Starts" tone="neutral" />}
                      {bySport.ties > 0 && <Stat value={String(bySport.ties)} label="Ties" tone="neutral" />}
                      {bySport.noResults > 0 && <Stat value={String(bySport.noResults)} label="No result" tone="neutral" />}
                      {run >= 2 && <Stat value={String(run)} label="Best win run" tone="neutral" />}
                      {tf.finals > 0 && <Stat value={String(tf.titles)} label={tf.titles === 1 ? 'Title' : 'Titles'} tone="neutral" />}
                      {tf.finals > 0 && <Stat value={String(tf.finals)} label={tf.finals === 1 ? 'Final' : 'Finals'} tone="neutral" />}
                    </View>
                  )}
                </>
              );
            })()}
            {/* SD-24 — singles / doubles W-L (when the player has played both)
                and the doubles record per partner. */}
            {(() => {
              const disc = disciplineRecords(history, ctxOf);
              const partners = partnerRecords(history, mateLines, matchById, ctxOf);
              return (
                <>
                  {disc.length >= 2 && (
                    <>
                      <Text style={st.totalsLabel}>Singles / doubles</Text>
                      <View style={st.statGrid}>
                        {disc.map((d) => <Stat key={d.key} value={wlText(d.record)} label={`${d.label} W-L`} tone="neutral" />)}
                      </View>
                    </>
                  )}
                  {partners.length > 0 && (
                    <>
                      <Text style={st.totalsLabel}>Partners</Text>
                      <Card style={{ gap: theme.spacing(2) }}>
                        {partners.map((p) => (
                          <View key={p.partnerId} style={st.partnerRow}>
                            <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{names.get(p.partnerId) ?? 'Partner'}</Text>
                            <Text style={textStyles.muted}>{p.played} {p.played === 1 ? 'match' : 'matches'}</Text>
                            <Text style={st.partnerWL}>{wlText(p)}</Text>
                          </View>
                        ))}
                      </Card>
                    </>
                  )}
                </>
              );
            })()}
            {/* Career sections — a second, quieter tier so they read as detail,
                not as more headline numbers. */}
            {schema?.careerView === 'sections' ? (() => {
              // SD-24 — every sport's career straight from its stat schema
              // (SD-15 / SD-16): averages, rates, bests and totals; rows
              // nobody tracked are hidden (D8). Cricket's Batting / Bowling /
              // Fielding render exactly as before (parity #19).
              const secs = careerSections(schema, history);
              return (
                <>
                  {secs.map((sec) => (
                    <React.Fragment key={sec.id}>
                      <Text style={st.totalsLabel}>{sec.title}</Text>
                      <View style={st.statGrid}>
                        {sec.rows.map((r) => (
                          <Stat
                            key={r.key} value={r.value} label={r.label} tone="neutral"
                            long={sport === 'cricket' ? undefined : sec.rows.some((x) => tileValueIsLong(x.value))}
                            coverage={r.coverage} open={openStat === r.key}
                            onToggle={() => setOpenStat(openStat === r.key ? null : r.key)}
                          />
                        ))}
                      </View>
                    </React.Fragment>
                  ))}
                </>
              );
            })() : Object.keys(bySport.totals).length > 0 && (
              <>
                <Text style={st.totalsLabel}>Totals · this sport</Text>
                <View style={st.statGrid}>
                  {Object.entries(bySport.totals).map(([k, v]) => {
                    const cov = statCoverage(stats.recent, sport, k);
                    // only flag when this stat was tracked in fewer games than the player played
                    const partial = cov.tracked < cov.total ? cov : undefined;
                    return (
                      <Stat
                        key={k} value={String(v)} label={labelLong(k, sport)} tone="neutral"
                        coverage={partial} open={openStat === k}
                        onToggle={() => setOpenStat(openStat === k ? null : k)}
                      />
                    );
                  })}
                </View>
              </>
            )}
            </>
            )}
          </>
        )}

        <Card style={{ gap: theme.spacing(2) }}>
          <View style={st.fbHeader}>
            <Text style={textStyles.h3}>Details</Text>
            {access !== 'none' && (
              <Text style={st.editLink} accessibilityRole="link" onPress={() => nav.navigate('EditProfile', access === 'admin' ? { playerId, asAdmin: true } : { playerId })}>Edit ›</Text>
            )}
          </View>
          {hasDetails ? (
            <>
              <View style={st.fbMeta}>
                {detail?.position ? <Pill label={`Position: ${detail.position}`} /> : null}
                {sideFields.map((f) =>
                  detail?.sides?.[f.key] ? <Pill key={f.key} label={`${f.label}: ${detail.sides[f.key]}`} /> : null
                )}
              </View>
              {detail?.teams?.length ? (
                <View style={{ gap: theme.spacing(1) }}>
                  <Text style={textStyles.muted}>Teams represented</Text>
                  {detail.teams.map((t, i) => {
                    const period = t.until
                      ? `${(t.since ?? '').slice(0, 4)}${t.since ? ' – ' : 'until '}${t.until.slice(0, 4)}`
                      : t.since
                      ? `since ${t.since.slice(0, 4)}`
                      : '';
                    return (
                      <Text key={i} style={textStyles.body}>
                        · {t.name}{t.jersey != null ? `  #${t.jersey}` : ''}
                        {period ? <Text style={textStyles.muted}>  · {period}</Text> : null}
                        {t.until ? <Text style={textStyles.muted}>  · past</Text> : null}
                      </Text>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={textStyles.muted}>
              {access === 'self' ? 'Add your position, dominant side and the teams you’ve represented.' : access === 'admin' ? 'No details yet — tap Edit to add their position and sides.' : 'No details added yet.'}
            </Text>
          )}
        </Card>

        {history.length > 0 && schema?.careerView !== 'measured' && (
          <>
            <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>Match history</Text>
            {history.map((l) => {
              const golfRound = !!l.eventId;
              const openable = golfRound || matchById.has(l.matchId);
              const golfLine = golfRound
                ? [
                    l.stats.strokes ? `${l.stats.strokes}${l.stats.toPar != null ? ` (${l.stats.toPar === 0 ? 'E' : l.stats.toPar > 0 ? `+${l.stats.toPar}` : l.stats.toPar})` : ''}` : '',
                    l.stats.stableford ? `${l.stats.stableford} pts` : '',
                    l.stats.birdies ? `${l.stats.birdies} birdie${l.stats.birdies === 1 ? '' : 's'}` : '',
                    l.stats.putts ? `${l.stats.putts} putts` : '',
                  ].filter(Boolean).join(' · ')
                : '';
              // SD-01: set/game sports lead with the match's set line, read from
              // this player's side ("6-4, 3-6, 7-6(4)").
              const hm = matchById.get(l.matchId);
              // SD-11: W / D / L / T / NR from this player's side (stored, else
              // derived from the match); undefined while the match is in play.
              const res = golfRound ? undefined : lineResult(l, hm);
              const persp: 'home' | 'away' = hm && l.opponent && l.opponent === hm.homeTeam.name ? 'away' : 'home';
              let setLine = '';
              // SD-20: + "6-4, 3-2 ret." / "w/o" for a match closed by hand.
              try { setLine = !golfRound && hm && (hm.status === 'completed' || hm.walkover) ? matchLine(hm, persp) : ''; } catch { setLine = ''; }
              const row = (
                <Card style={[st.histRow, { borderLeftWidth: 3, borderLeftColor: (golfRound ? l.won : res === 'W') ? theme.colors.primary : theme.colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>
                      {golfRound ? `⛳ ${l.opponent ?? 'Round'}` : `vs ${l.opponent ?? 'TBD'}`}
                      {l.date ? <Text style={st.histDate}>  ·  {formatDay(l.date)}</Text> : null}
                    </Text>
                    <Text style={textStyles.muted}>
                      {/* SD-24: the score line + the key stats (no zeros, no record keys, correct plurals) */}
                      {golfRound ? golfLine : sport === 'cricket' ? cricketMatchLine(l.stats) : [setLine, historyStats(l, ctxOf.get(l.id))].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pill
                    label={golfRound ? (l.won ? '1ST' : 'PLAYED') : res ? RESULT_PILL[res] : 'LIVE'}
                    color={(golfRound ? l.won : res === 'W') ? theme.colors.primary + '22' : theme.colors.surfaceAlt}
                    textColor={(golfRound ? l.won : res === 'W') ? theme.colors.primary : theme.colors.textMuted}
                  />
                  {openable && <Text style={st.chevron}>›</Text>}
                </Card>
              );
              return openable ? (
                <TouchableOpacity accessibilityRole="button" key={l.id} activeOpacity={0.85} onPress={() => (golfRound ? nav.navigate('GolfRound', { eventId: l.eventId! }) : openMatch(l.matchId))}>{row}</TouchableOpacity>
              ) : (
                <View key={l.id}>{row}</View>
              );
            })}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

/** Appearances in one sport for a stats bundle. */
function countInSportOf(s: { bySport: { sport: string; matches: number }[] }, sport: string): number {
  return s.bySport.find((b) => b.sport === sport)?.matches ?? 0;
}

function Stat({
  value, label, coverage, open, onToggle, tone = 'accent', long,
}: {
  value: string; label: string; tone?: 'accent' | 'neutral';
  /** the smaller figure (SD-24: set per row so a row reads at one size);
   *  default: from this value's own length */
  long?: boolean;
  coverage?: { tracked: number; total: number }; open?: boolean; onToggle?: () => void;
}) {
  const inner = (
    <Card style={st.statCardInner}>
      {coverage ? <Text style={st.cloud}>☁</Text> : null}
      <Text style={[st.statValue, tone === 'neutral' && st.statValueNeutral, (long ?? tileValueIsLong(value)) && st.statValueLong]} numberOfLines={1}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
      {coverage && open ? (
        <Text style={st.coverageNote}>tracked in {coverage.tracked} of {coverage.total} games</Text>
      ) : null}
    </Card>
  );
  // A partial-coverage stat is tappable: the cloud opens the games it spans.
  return (
    <View style={st.statCardWrap}>
      {coverage ? <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onToggle}>{inner}</TouchableOpacity> : inner}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chipRow: { flexDirection: 'row', gap: theme.spacing(2), paddingRight: theme.spacing(2) },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  statCardInner: { width: '100%', flexGrow: 1, alignItems: 'center', gap: theme.spacing(1) },
  statCardWrap: { width: '30%', flexGrow: 1 },
  statValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  /** from 4 characters ("100%", "12-3-10") the figure fits one line on a 375 px phone (SD-24) */
  statValueLong: { fontSize: theme.font.h3, lineHeight: theme.font.h1 + 6 },
  statValueNeutral: { color: theme.colors.text },
  totalsLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(1) },
  cloud: { position: 'absolute', top: theme.spacing(2), right: theme.spacing(2), fontSize: 12, color: theme.colors.accent },
  coverageNote: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  fbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fbMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  partnerWL: { color: theme.colors.text, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  histDate: { color: theme.colors.textMuted, fontWeight: '400' },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
