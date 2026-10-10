/** Per-sport standings: a league table (P/W/L/Pts) plus the individual stat
 *  leaders. A sport selector appears for multi-sport meets; a single-sport
 *  tournament just shows that sport. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, SelectChip, ScreenTitle, EmptyState, TextField, Button, textStyles } from '../components/ui';
import { RankBadge, podiumColor } from '../components/Rank';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { DivisionTabs } from '../components/DivisionTabs';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { canManageTournament } from '../core/org';
import { useTournament, useTournamentById, useStandings, useDivisions, useOrganizations } from '../data/hooks';
import { leaderStat, teamStandings, standingsConfigFromFormat, type PointsAdjustment, type TeamStanding } from '../data/standings';
import { unplayed } from '../components/LeagueTable';
import { matchesInDivision, standingsPhases } from '../data/groups';
import { structureFromFormat } from '../data/structureConfig';
import { manualRows, withManualRows, blankManualRow, rankManualRows, type ManualStandingRow } from '../data/manualStandings';
import { getMyPlayerId, updateTournament, patchTournamentFormat, formatDiff, savePointsAdjustments } from '../data/repos';
import { notice, confirmAction } from '../core/confirm';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function StandingsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Standings'>>();
  // Opened from a specific tournament? Scope to it; otherwise use the one
  // currently selected on Home.
  const selected = useTournament();
  const opened = useTournamentById(params?.tournamentId);
  const tournament = params?.tournamentId ? opened : selected;
  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId>(params?.sport ?? 'football');
  // Clamp the shown sport to one this tournament actually has (a generic open
  // defaults to football, which the meet may not include).
  const activeSport = sports.includes(sport) ? sport : sports[0] ?? sport;
  const { teams, leaders, matches } = useStandings(activeSport, params?.tournamentId);
  // Scope the table to the selected division (age × gender), if any.
  const { categories: divisions, entries, activeCat, setActiveCat } = useDivisions(params?.tournamentId);
  const table = useMemo(
    () => (activeCat
      ? teamStandings(matchesInDivision(matches, entries, activeCat), activeSport, standingsConfigFromFormat(activeSport, tournament?.formats?.[activeSport]), undefined, entries.map((e) => e.team))
      : teams),
    [activeCat, matches, entries, activeSport, teams, tournament],
  );
  // Saved adjustments show straight away (the tournament hook doesn't refetch).
  const [adjOverride, setAdjOverride] = useState<Record<string, string | undefined>>({});
  const cfg = useMemo(() => {
    const fmt = { ...((tournament?.formats?.[activeSport] as Record<string, unknown>) ?? {}) };
    if (activeSport in adjOverride) fmt.pointsAdj = adjOverride[activeSport];
    return standingsConfigFromFormat(activeSport, fmt);
  }, [activeSport, tournament, adjOverride]);
  const phases = useMemo(
    () => standingsPhases(activeCat ? matchesInDivision(matches, entries, activeCat) : matches, activeSport, cfg, entries.map((e) => e.team)),
    [activeCat, matches, entries, activeSport, cfg],
  );
  const lead = leaderStat(activeSport);
  const [showTeams, setShowTeams] = useState(false);
  const [showLeaders, setShowLeaders] = useState(false);
  // Draws only matter for sports that can draw (football, cricket) — hide the
  // column for basketball/tennis/etc. where every result has a winner.
  const hasDraws = table.some((t) => t.drawn > 0);

  // ── Scorecard / manual-standings mode ─────────────────────────────────────
  // When the sport's structure is manual, the organizer maintains the table by
  // hand (no auto-compute). Managers get an editable grid; everyone else sees it
  // ranked read-only.
  const manual = structureFromFormat(tournament?.formats?.[activeSport])?.manualStandings ?? false;
  const divisionKey = activeCat ?? '';
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => { let on = true; getMyPlayerId(profile?.id).then((id) => on && setMyId(id)); return () => { on = false; }; }, [profile?.id]);
  const canManage = !!tournament && canManageTournament(tournament, orgs, myId);
  const [rows, setRows] = useState<ManualStandingRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // (Re)load rows from the tournament whenever the scope changes and there are no
  // unsaved edits (so a background refresh can't clobber in-progress typing).
  useEffect(() => {
    if (!dirty) setRows(manualRows(tournament?.formats?.[activeSport], divisionKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id, activeSport, divisionKey, tournament?.formats]);
  const editRow = (id: string, patch: Partial<ManualStandingRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addRow = () => { setRows((rs) => [...rs, blankManualRow()]); setDirty(true); };
  const removeRow = (id: string) => { setRows((rs) => rs.filter((r) => r.id !== id)); setDirty(true); };
  const saveAdjustments = async (list: PointsAdjustment[], detail: string) => {
    if (!tournament?.id) return;
    try {
      // Stamp who made a new adjustment (shown in the public footnote).
      list = list.map((x) => (x.byName ? x : { ...x, byName: profile?.fullName ?? undefined }));
      await savePointsAdjustments(tournament.id, activeSport, list, { detail, byPlayerId: myId ?? undefined, byName: profile?.fullName });
      setAdjOverride((o) => ({ ...o, [activeSport]: list.length ? JSON.stringify(list) : undefined }));
    } catch (e) {
      notice('Couldn’t save the adjustment', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  const saveRows = async () => {
    if (!tournament?.id) return;
    setSaving(true);
    const clean = rows.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() }));
    const before = tournament.formats?.[activeSport] as Record<string, unknown> | undefined;
    await patchTournamentFormat(tournament.id, activeSport, formatDiff(before, withManualRows(tournament.formats?.[activeSport], divisionKey, clean) as Record<string, unknown>));
    setSaving(false);
    setDirty(false);
  };
  const numField = (v: number) => (v === 0 ? '' : String(v));
  const toNum = (t: string) => Math.max(0, parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);

  // Breadcrumb: name the nav bar after the tournament; the in-content title is "Standings".
  useEffect(() => {
    if (tournament) nav.setOptions({ title: tournament.name });
  }, [nav, tournament?.name]);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Standings" />

        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {sports.map((s) => (
              <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={activeSport === s} onPress={() => setSport(s)} />
            ))}
          </ScrollView>
        )}

        <DivisionTabs categories={divisions} activeCat={activeCat} onChange={setActiveCat} />

        {manual && (
          <>
            <SectionHeader title={`${getSport(activeSport).icon} Scorecard`} count={rows.length} />
            {canManage ? (
              <Card style={{ gap: theme.spacing(3) }}>
                <Text style={textStyles.muted}>You maintain this table by hand. Add each team/player and their record.</Text>
                {rows.map((r) => (
                  <View key={r.id} style={st.editRow}>
                    <TextField label="" value={r.name} onChange={(t) => editRow(r.id, { name: t })} placeholder="Team / player name" />
                    <View style={st.numRow}>
                      {([['P', 'played'], ['W', 'won'], ['D', 'drawn'], ['L', 'lost'], ['Pts', 'points']] as const).map(([lbl, key]) => (
                        <View key={key} style={st.numField}>
                          <Text style={st.numLbl}>{lbl}</Text>
                          <TextField label="" value={numField(r[key])} onChange={(t) => editRow(r.id, { [key]: toNum(t) })} placeholder="0" autoCapitalize="none" />
                        </View>
                      ))}
                      <Text style={st.removeX} accessibilityRole="button" accessibilityLabel={`Remove ${r.name || 'row'}`} onPress={() => removeRow(r.id)}>✕</Text>
                    </View>
                  </View>
                ))}
                <Text style={st.addRow} accessibilityRole="button" onPress={addRow}>＋ Add row</Text>
                {dirty && <Button label={saving ? 'Saving…' : 'Save table'} onPress={saveRows} />}
              </Card>
            ) : (
              <Card style={{ gap: theme.spacing(1) }}>
                <View style={[st.row, st.head]}>
                  <View style={st.posCell}><Text style={st.headText}>#</Text></View>
                  <Text style={[st.teamCol, st.headText]}>Team</Text>
                  <Text style={[st.num, st.headText]}>P</Text>
                  <Text style={[st.num, st.headText]}>W</Text>
                  <Text style={[st.num, st.headText]}>D</Text>
                  <Text style={[st.num, st.headText]}>L</Text>
                  <Text style={[st.num, st.headText]}>Pts</Text>
                </View>
                {rows.length === 0 ? (
                  <EmptyState icon="📋" title="No standings entered yet" hint="The organizer maintains this table." compact />
                ) : (
                  rankManualRows(rows).map((r, i) => (
                    <View key={r.id} style={[st.row, i > 0 && st.rowDivider]}>
                      <RankBadge index={i} />
                      <Text style={[st.teamCol, textStyles.body]} numberOfLines={1}>{r.name}</Text>
                      <Text style={st.num}>{r.played}</Text>
                      <Text style={st.num}>{r.won}</Text>
                      <Text style={st.num}>{r.drawn}</Text>
                      <Text style={st.num}>{r.lost}</Text>
                      <Text style={[st.num, st.pts]}>{r.points}</Text>
                    </View>
                  ))
                )}
              </Card>
            )}
          </>
        )}

        {!manual && (<>
        {/* One table per league phase (league / Group A / Group B / Super / Swiss);
            knockout results never appear in a table — the bracket covers them. */}
        {phases.length === 0 ? (
          <>
            <SectionHeader title={`${getSport(activeSport).icon} Team standings`} count={0} />
            <Card><EmptyState icon="🏁" title={`No completed ${getSport(activeSport).name.toLowerCase()} matches yet`} hint="The table fills in as results come in." compact /></Card>
          </>
        ) : phases.map((ph) => (
          <PhaseTable key={ph.key} title={phases.length === 1 && ph.key === 'league' ? `${getSport(activeSport).icon} Team standings` : ph.title}
            phaseKey={ph.key} rows={ph.rows} adjustments={cfg.adjustments ?? []} canManage={canManage}
            expanded={showTeams} onToggle={() => setShowTeams((v) => !v)}
            onTeam={(id) => nav.navigate('Team', { teamId: id })}
            onSave={(list, detail) => saveAdjustments(list, detail)} />
        ))}

        <SectionHeader
          title={`Top performers · ${lead.label}`}
          count={leaders.length}
          onSeeAll={leaders.length > SECTION_CAP ? () => setShowLeaders((v) => !v) : undefined}
          expanded={showLeaders}
        />
        {leaders.length === 0 ? (
          <Card><EmptyState icon="⭐" title={`No ${lead.label} recorded yet`} hint="Leaders appear here once players are scored." compact /></Card>
        ) : (
          (showLeaders ? leaders : leaders.slice(0, SECTION_CAP)).map((l, i) => {
            const tier = podiumColor(i);
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}. ${l.name}, ${l.value} ${lead.label}`}
                key={l.playerId}
                activeOpacity={0.85}
                onPress={() => nav.navigate('PlayerProfile', { playerId: l.playerId })}
              >
                <Card style={[st.leaderRow, tier ? { borderColor: tier + '66' } : null]}>
                  <RankBadge index={i} />
                  <View style={{ flex: 1 }}>
                    <Text style={[textStyles.body, i === 0 && { fontWeight: '700' }]}>{l.name}</Text>
                    {l.houseName ? <Text style={textStyles.muted}>{l.houseName}</Text> : null}
                  </View>
                  <Text style={st.leaderVal}>{l.value}</Text>
                  <Text style={textStyles.muted}> {lead.label}</Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One phase's table (league / Group A / Super Four / Swiss). Managers get a ±
 *  per row: a signed points adjustment with a public reason (parity #07). */
function PhaseTable({ title, phaseKey, rows, adjustments, canManage, expanded, onToggle, onTeam, onSave }: {
  title: string; phaseKey: string; rows: TeamStanding[]; adjustments: PointsAdjustment[]; canManage: boolean;
  expanded: boolean; onToggle: () => void; onTeam: (teamId: string) => void;
  onSave: (list: PointsAdjustment[], detail: string) => Promise<void>;
}) {
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');
  const hasDraws = rows.some((t) => t.drawn > 0);
  const hasNr = rows.some((t) => (t.nr ?? 0) > 0);
  const hasNrr = rows.some((t) => t.nrr !== undefined);
  const phaseLabel = phaseKey === 'league' ? '' : ` (${title})`;
  const inPhase = (a: PointsAdjustment) => !a.phase || a.phase === phaseKey;
  const shown = expanded ? rows : rows.slice(0, SECTION_CAP);
  const nameOf = (id: string) => rows.find((r) => r.teamId === id)?.name ?? 'A team';
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
  const footnotes = adjustments.filter((a) => inPhase(a) && rows.some((r) => r.teamId === a.teamId));
  return (
    <>
      <SectionHeader title={title} count={rows.length} onSeeAll={rows.length > SECTION_CAP ? onToggle : undefined} expanded={expanded} />
      <Card style={{ gap: theme.spacing(1) }}>
        <View style={[st.row, st.head]}>
          <View style={st.posCell}><Text style={st.headText}>#</Text></View>
          <Text style={[st.teamCol, st.headText]}>Team</Text>
          <Text style={[st.num, st.headText]}>P</Text>
          <Text style={[st.num, st.headText]}>W</Text>
          {hasDraws && <Text style={[st.num, st.headText]}>D</Text>}
          <Text style={[st.num, st.headText]}>L</Text>
          {hasNr && <Text style={[st.num, st.headText]}>NR</Text>}
          {hasNrr && <Text style={[st.num, st.headText, { width: 48 }]}>NRR</Text>}
          <Text style={[st.num, st.headText]}>Pts</Text>
          {canManage && <View style={{ width: ADJ_W, marginLeft: 2 }} />}
        </View>
        {shown.map((t, i) => {
          const tier = podiumColor(i);
          const mine = adjustments.filter((a) => a.teamId === t.teamId && inPhase(a));
          return (
            <View key={t.teamId}>
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => onTeam(t.teamId)}
                accessibilityLabel={`${i + 1}. ${t.name}, ${t.points} points${t.adjust ? `, adjusted ${signed(t.adjust)}` : ''}`}>
                <View style={[st.row, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 3 && st.rowDivider]}>
                  <RankBadge index={i} />
                  <View style={[st.teamCol, st.teamCell]}>
                    <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
                    <Text style={[textStyles.body, i === 0 && { fontWeight: '700' }]} numberOfLines={1}>{t.name}</Text>
                  </View>
                  <Text style={st.num}>{t.played}</Text>
                  <Text style={st.num}>{t.won}</Text>
                  {hasDraws && <Text style={st.num}>{t.drawn}</Text>}
                  <Text style={st.num}>{t.lost}</Text>
                  {hasNr && <Text style={st.num}>{t.nr ?? 0}</Text>}
                  {hasNrr && <Text style={[st.num, { width: 48 }]}>{t.nrr === undefined ? '—' : `${t.nrr >= 0 ? '+' : ''}${t.nrr.toFixed(2)}`}</Text>}
                  <Text style={[st.num, st.pts]}>{t.points}{t.adjust ? '*' : ''}</Text>
                  {canManage && (
                    <TouchableOpacity style={st.adjBtn} accessibilityRole="button" accessibilityLabel={`Adjust points for ${t.name}`}
                      accessibilityState={{ expanded: openTeam === t.teamId }} hitSlop={6} activeOpacity={0.7}
                      onPress={() => { setOpenTeam(openTeam === t.teamId ? null : t.teamId); setDelta(0); setReason(''); }}>
                      <Text style={st.adjBtnIcon}>±</Text>
                      <Text style={st.adjBtnText}>Adjust</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
              {canManage && openTeam === t.teamId && (
                <View style={st.adjPanel}>
                  <View style={st.adjStepper}>
                    <Button label="−" variant="ghost" onPress={() => setDelta((d) => Math.max(-20, d - 1))} />
                    <Text style={st.adjValue}>{signed(delta) || '0'}</Text>
                    <Button label="+" variant="ghost" onPress={() => setDelta((d) => Math.min(20, d + 1))} />
                  </View>
                  <TextField label="Reason (shown publicly)" value={reason} onChange={setReason} placeholder="e.g. late arrival" />
                  <Button label="Save adjustment" disabled={delta === 0 || reason.trim().length < 3} onPress={async () => {
                    const a: PointsAdjustment = { id: `adj-${Date.now()}`, teamId: t.teamId, points: delta, reason: reason.trim(), ...(phaseKey !== 'league' ? { phase: phaseKey } : {}), at: new Date().toISOString() };
                    await onSave([...adjustments, a], `${t.name} ${signed(delta)}${phaseLabel}: ${a.reason}`);
                    setOpenTeam(null);
                  }} />
                  {mine.map((a) => (
                    <View key={a.id} style={st.adjRow}>
                      <Text style={[textStyles.muted, { flex: 1 }]}>{signed(a.points)} · {a.reason}</Text>
                      <Text style={st.adjRemove} accessibilityRole="button" onPress={async () => {
                        if (!(await confirmAction('Remove this adjustment?', `${t.name} ${signed(a.points)} · ${a.reason}`, 'Remove', true))) return;
                        await onSave(adjustments.filter((x) => x.id !== a.id), `${t.name}: removed ${signed(a.points)}${phaseLabel} (${a.reason})`);
                      }}>✕</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {footnotes.map((a) => (
          <Text key={a.id} style={textStyles.muted}>
            * {nameOf(a.teamId)} {signed(a.points)} · {a.reason}{a.byName ? ` · by ${a.byName}` : ''}, {new Date(a.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </Text>
        ))}
        {/* SD-10: Swiss byes and chess forfeits score but aren't games played (P / W / D / L). */}
        {rows.some((t) => unplayed(t)) && (
          <Text style={textStyles.muted}>
            Not games played (the points count): {rows.filter((t) => unplayed(t)).map((t) => `${t.name}: ${unplayed(t)}`).join('; ')}
          </Text>
        )}
      </Card>
    </>
  );
}

/** Width of the "± Adjust" button column (and its header spacer). */
const ADJ_W = 40;
const st = StyleSheet.create({
  adjBtn: {
    width: ADJ_W, minHeight: 40, marginLeft: 2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.primary + '66', borderRadius: theme.radius.sm,
  },
  adjBtnIcon: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.body, lineHeight: theme.font.body + 2 },
  adjBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.tiny },
  adjPanel: { gap: theme.spacing(2), padding: theme.spacing(3), marginVertical: theme.spacing(1), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  adjStepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  adjValue: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', minWidth: 40, textAlign: 'center' },
  adjRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  adjRemove: { color: theme.colors.danger, fontWeight: '900', paddingHorizontal: theme.spacing(2) },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  section: { marginTop: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  head: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(2) },
  headText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  posCell: { width: 28, alignItems: 'center', justifyContent: 'center' },
  teamCol: { flex: 1 },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  num: { width: 32, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  pts: { fontWeight: '900', color: theme.colors.primary },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  leaderVal: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
  editRow: { gap: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(3) },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing(2) },
  numField: { flex: 1 },
  numLbl: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  removeX: { color: theme.colors.danger, fontSize: theme.font.body, fontWeight: '900', paddingHorizontal: theme.spacing(1), paddingBottom: theme.spacing(2) },
  addRow: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
