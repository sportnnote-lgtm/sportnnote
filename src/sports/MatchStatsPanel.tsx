/**
 * SD-22 — the per-set match-stats panel (ATP / BWF style): a two-column
 * home-vs-away comparison of the serve / return figures `serveStats` replays
 * from the point log, with a Match / Set N (Game N) filter and, where the app
 * names the server, each serving player's line. Shown on the Score tab of
 * tennis, padel, badminton, table tennis, squash and pickleball. Works for old
 * and corrected matches (derived only). Volleyball (SD-58) once the toss is
 * recorded: side-out %, points won on serve, aces / serve errors, by server.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import { serveStats, serveRows, playerServeLine, type ServeSport } from './serveStats';
import { detailRows } from './pointDetail';
import type { LiveEvent } from './liveEvents';

export function MatchStatsPanel({
  sport, state, homeName, awayName, homeRoster = [], awayRoster = [],
  homeColor = theme.colors.home, awayColor = theme.colors.away,
}: {
  sport: ServeSport;
  state: unknown;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
}) {
  const hIds = homeRoster.map((p) => p.id).join(',');
  const aIds = awayRoster.map((p) => p.id).join(',');
  // Re-derived when the state (log) or the roster that names the server changes.
  const st = useMemo(
    () => serveStats(sport, state, { home: hIds ? hIds.split(',') : [], away: aIds ? aIds.split(',') : [] }),
    [sport, state, hIds, aIds],
  );
  const [scope, setScope] = useState<'all' | number>('all');
  if (!st || st.match.rallies === 0) return null;
  const periods = st.periods.length;
  const active = scope !== 'all' && scope > periods ? 'all' : scope;
  const block = active === 'all' ? st.match : st.periods[active - 1];
  const rows = serveRows(st, block);
  // SD-107 — point detail (winners / errors / by stroke), when the match tracked it
  const events = (state as { events?: LiveEvent[] } | null)?.events;
  const dRows = sport === 'volleyball' ? [] : detailRows(sport, events, active === 'all' ? undefined : active);
  const vb = sport === 'volleyball';
  const word = st.unit === 'set' || vb ? 'Set' : 'Game';
  const nameOf = (id: string) => [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName ?? id;
  const players = Object.entries(block.players).filter(([, p]) => p.srvPlayed > 0)
    .sort(([, x], [, y]) => (x.side === y.side ? 0 : x.side === 'home' ? -1 : 1));
  return (
    <View style={{ gap: theme.spacing(2) }}>
    <Text style={st_.title}>Match stats</Text>
    <View style={st_.card} accessibilityLabel="Match stats">
      <View style={st_.head}>
        <View style={st_.side}><View style={[st_.dot, { backgroundColor: homeColor }]} /><Text style={st_.team} numberOfLines={1}>{homeName}</Text></View>
        <View style={[st_.side, { justifyContent: 'flex-end' }]}><Text style={st_.team} numberOfLines={1}>{awayName}</Text><View style={[st_.dot, { backgroundColor: awayColor }]} /></View>
      </View>
      {periods >= 2 && (
        <View style={st_.chips}>
          <SelectChip label="Match" active={active === 'all'} onPress={() => setScope('all')} />
          {st.periods.map((_, i) => (
            <SelectChip key={i} label={`${word} ${i + 1}`} active={active === i + 1} onPress={() => setScope(i + 1)} />
          ))}
        </View>
      )}
      {rows.map((r) => {
        const tot = r.hv + r.av;
        const hw = tot > 0 ? r.hv / tot : 0.5;
        return (
          <View key={r.key} style={st_.row} accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
            <View style={st_.vals}>
              <Text style={[st_.val, r.hv > r.av && st_.lead]}>{r.home}</Text>
              <Text style={st_.label}>{r.label}</Text>
              <Text style={[st_.val, st_.right, r.av > r.hv && st_.lead]}>{r.away}</Text>
            </View>
            <View style={st_.bar}>
              <View style={{ flex: hw, backgroundColor: homeColor, opacity: tot > 0 ? 1 : 0.25 }} />
              <View style={{ flex: 1 - hw, backgroundColor: awayColor, opacity: tot > 0 ? 1 : 0.25 }} />
            </View>
          </View>
        );
      })}
      {dRows.length > 0 && (
        <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(1) }} accessibilityLabel="Point detail">
          <Text style={st_.sub}>Point detail · from the points described</Text>
          {dRows.map((r) => {
            const tot = r.hv + r.av;
            const hw = tot > 0 ? r.hv / tot : 0.5;
            return (
              <View key={r.key} style={st_.row} accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
                <View style={st_.vals}>
                  <Text style={[st_.val, r.hv > r.av && st_.lead]}>{r.home}</Text>
                  <Text style={st_.label}>{r.label}</Text>
                  <Text style={[st_.val, st_.right, r.av > r.hv && st_.lead]}>{r.away}</Text>
                </View>
                <View style={st_.bar}>
                  <View style={{ flex: hw, backgroundColor: homeColor, opacity: tot > 0 ? 1 : 0.25 }} />
                  <View style={{ flex: 1 - hw, backgroundColor: awayColor, opacity: tot > 0 ? 1 : 0.25 }} />
                </View>
              </View>
            );
          })}
        </View>
      )}
      {players.length > 0 && (st.doubles || vb) && (
        <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(1) }}>
          <Text style={st_.sub}>{vb ? 'Points won on serve, by server' : 'Service points won, by server'}</Text>
          {players.map(([id, p]) => (
            <View key={id} style={st_.pRow}>
              <View style={[st_.dot, { backgroundColor: p.side === 'home' ? homeColor : awayColor }]} />
              <Text style={st_.pName} numberOfLines={1}>{nameOf(id)}</Text>
              <Text style={st_.pVal}>{playerServeLine(st, p)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={st_.note}>
        From the point log{vb ? ' · serve order from the toss and rotation' : ''}{st.doubles && !st.serverKnown ? ' · doubles: the serving player isn’t named in this sport, so serve figures are per side' : ''}.
      </Text>
    </View>
    </View>
  );
}

const st_ = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  side: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), flex: 1, minWidth: 0 },
  team: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { gap: 3, paddingVertical: 2 },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  val: { color: theme.colors.text, fontSize: theme.font.small, width: 92, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  lead: { fontWeight: '800' },
  label: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  bar: { flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  pName: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  pVal: { color: theme.colors.text, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
