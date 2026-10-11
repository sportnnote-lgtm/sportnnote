/**
 * SD-107 — the optional "How was it won?" row under a racket sport's scoring
 * buttons. The default stays one tap (who won the point); with "Point detail"
 * on, this row describes the LAST point: Winner ▸ stroke, Forced error,
 * Unforced error ▸ stroke, Ace / Service winner / Service fault (offered by
 * who served it), squash Stroke / No let, tennis "At net" and "2nd serve".
 * Every tap dispatches POINT_DETAIL (annotates that point, no score effect;
 * undo removes it). Skippable — the next point simply gets its own row.
 * See pointDetail.ts for the model and credits.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { pointRows, type EditRow } from './rallyEdit';
import { serveStats } from './serveStats';
import {
  DETAIL_HOWS, STROKES, hasNetFlag, hasServeDetail, howDef, pdText, winnerSide,
  type DetailSport, type How, type PointDetail,
} from './pointDetail';

type Side = 'home' | 'away';

export function PointDetailRow({
  sport, state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [], rowsOf = pointRows,
}: {
  sport: DetailSport;
  state: { events: LiveEvent[]; pointDetail?: boolean; serveDetail?: boolean; ended?: boolean };
  dispatch: (a: ScoreAction) => void;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** the describable rows of the log (rally engine: side-out rallies too) */
  rowsOf?: (events: LiveEvent[]) => EditRow[];
}) {
  const on = state.pointDetail === true;
  const serveOn = hasServeDetail(sport) && state.serveDetail === true;
  const [skipped, setSkipped] = useState<number | null>(null);
  const rows = rowsOf(state.events ?? []);
  const last = rows[rows.length - 1];
  // Who served the last point: offers Ace / Service winner only to the server,
  // a service fault only to the receiver. Re-derived when a point is added.
  const n = state.events?.length ?? 0;
  const server = useMemo(() => (on ? serveStats(sport, state)?.last?.server : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sport, n, on]);

  const toggle = (
    <View style={st.toggleRow}>
      <Text style={st.meta}>🔎 Point detail (optional)</Text>
      <SelectChip label={on ? 'On' : 'Off'} active={on} onPress={() => dispatch({ type: 'SET_DETAIL', payload: { pointDetail: !on } })} />
      {hasServeDetail(sport) && (
        <SelectChip label="1st / 2nd serve" active={serveOn} onPress={() => dispatch({ type: 'SET_DETAIL', payload: { serveDetail: !serveOn } })} />
      )}
    </View>
  );
  if (!last || (!on && !serveOn) || last.e.df || last.e.pen || skipped === last.e.id) return toggle;

  const e = last.e;
  const W = winnerSide(e) as Side | undefined;
  if (W !== 'home' && W !== 'away') return toggle;
  const L: Side = W === 'home' ? 'away' : 'home';
  const nameOf = (s: Side) => (s === 'home' ? homeName : awayName);
  const loserRoster = L === 'home' ? homeRoster : awayRoster;
  const pd = e.pd;
  const isAce = e.kind === 'ace';
  const hows = on && !isAce ? DETAIL_HOWS[sport].filter((h) => !h.serve || !server || (h.serve === 'server' ? server === W : server !== W)) : [];
  const sel = pd ? howDef(sport, pd.how) : undefined;
  const send = (next: PointDetail | null) => dispatch({ type: 'POINT_DETAIL', payload: { pd: next } });
  // singles: the erring player is the opponent; doubles: pick (optional)
  const soloErr = loserRoster.length === 1 ? { playerId: loserRoster[0].id, playerName: loserRoster[0].fullName } : undefined;
  const pick = (how: How) => {
    if (pd?.how === how) return send(null);
    const d = howDef(sport, how);
    send({ how, ...(d?.credit === 'loser' && soloErr ? { err: soloErr } : {}) });
  };
  const serve2 = serveOn && (e.serve === 1 || e.serve === 2);

  return (
    <View style={st.box} accessibilityLabel="Point detail">
      {toggle}
      <View style={st.head}>
        <Text style={st.label} numberOfLines={1}>How was it won? · {e.kind !== 'rally' && e.playerName ? e.playerName : nameOf(W)}{isAce ? ' · ace' : ''}</Text>
        <Text style={st.skip} onPress={() => setSkipped(e.id)} accessibilityRole="button">Skip</Text>
      </View>
      {hows.length > 0 && (
        <View style={st.chips}>
          {hows.map((h) => <SelectChip key={h.how} label={h.chip} active={pd?.how === h.how} onPress={() => pick(h.how)} />)}
        </View>
      )}
      {sel?.strokes && pd && (
        <View style={st.chips}>
          {sel.strokes.map((k) => (
            <SelectChip key={k} label={STROKES[k]?.chip ?? k} active={pd.stroke === k}
              onPress={() => send({ ...pd, ...(pd.stroke === k ? { stroke: undefined } : { stroke: k }) })} />
          ))}
        </View>
      )}
      {sel?.credit === 'loser' && pd && loserRoster.length >= 2 && (
        <View style={st.chips}>
          <Text style={[st.meta, { alignSelf: 'center' }]}>By:</Text>
          {loserRoster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={pd.err?.playerId === p.id}
              onPress={() => send({ ...pd, err: pd.err?.playerId === p.id ? undefined : { playerId: p.id, playerName: p.fullName } })} />
          ))}
        </View>
      )}
      {(serve2 || (hasNetFlag(sport) && sel?.credit === 'winner' && pd)) && (
        <View style={st.chips}>
          {hasNetFlag(sport) && sel?.credit === 'winner' && pd && (
            <SelectChip label="At net" active={!!pd.net} onPress={() => send({ ...pd, net: pd.net ? undefined : true })} />
          )}
          {serve2 && (
            <SelectChip label="2nd serve" active={e.serve === 2} onPress={() => dispatch({ type: 'POINT_DETAIL', payload: { serve: e.serve === 2 ? 1 : 2 } })} />
          )}
        </View>
      )}
      {pd ? <Text style={st.meta}>✓ {pdText(pd)}{e.serve === 2 ? ' · 2nd serve' : ''}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  skip: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
