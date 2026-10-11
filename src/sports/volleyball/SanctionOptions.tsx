/**
 * SD-136 — volleyball's Quick options tiles: 🟨 Sanction (FIVB 21: warning,
 * penalty, expulsion, disqualification) and ⏱️ Delay (FIVB 16.2: delay warning,
 * delay penalty). Never next to the point buttons. The next level is
 * suggested; the scorer may pick another (the referee decides by the
 * offence). Every sanction asks first (askConfirm) — a penalty gives the
 * opponent a point and the serve. One step Undo takes back. Rules + reducer
 * step: ./sanctions.ts, engine.ts `sanctionStep`.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { Tile } from '../../components/QuickOptionsSheet';
import { askConfirm } from '../../components/ConfirmSheet';
import type { Player } from '../../core/types';
import type { QuickOptionsProps } from '../types';
import type { VolleyballState } from './engine';
import {
  VB_MISCONDUCT_REASONS, VB_SANCTIONS, oppSide, sanctionDef, sanctionEffect, sanctionsOf, suggestSanction,
  type VbSanctionLevel, type VbSanctionTrack,
} from './sanctions';

type Side = 'home' | 'away';

export function VolleyballQuickOptions({ state, dispatch, homeRoster, awayRoster, homeName, awayName, onDone }: QuickOptionsProps) {
  const s = state as VolleyballState;
  const [open, setOpen] = useState<VbSanctionTrack | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [level, setLevel] = useState<VbSanctionLevel | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  if (!s || s.ended) return null;
  const events = s.events ?? [];
  const nameOf = (x: Side) => (x === 'home' ? homeName : awayName);
  const rosterOf = (x: Side) => (x === 'home' ? homeRoster : awayRoster);
  const toggle = (k: VbSanctionTrack) => { setSide(null); setPlayer(null); setLevel(null); setReason(null); setOpen((o) => (o === k ? null : k)); };

  const panel = (track: VbSanctionTrack) => {
    const suggested = side ? suggestSanction(events, side, track, player?.id) : null;
    const chosen = level ?? suggested;
    const def = chosen ? sanctionDef(chosen) : undefined;
    const offender = player?.fullName ?? (side ? nameOf(side) : '');
    const other = side ? nameOf(oppSide(side)) : '';
    // expulsion / disqualification name a player (they leave the court)
    const needsPlayer = def?.effect === 'set' || def?.effect === 'match';
    const so = side ? sanctionsOf(events).filter((x) => x.by === side && sanctionDef(x.level)?.track === track).length : 0;
    const apply = async () => {
      if (!side || !chosen || !def || (needsPlayer && !player)) return;
      const payload = { vb: chosen, ...(reason ? { reason } : {}), ...(player ? { playerId: player.id, playerName: player.fullName } : {}) };
      // close the sheet first so the confirm isn't stacked on it (iOS)
      onDone();
      await new Promise((r) => setTimeout(r, 350));
      const ok = await askConfirm({
        title: `${def.icon} ${def.label} — ${offender}?`,
        message: `${sanctionEffect(chosen, offender, other)} (${def.rule})`,
        yesLabel: `Yes, ${def.label.toLowerCase()}`, noLabel: 'No, cancel',
        tone: def.effect === 'none' ? 'caution' : 'danger',
      });
      if (!ok) return;
      dispatch({ type: 'CONDUCT', side, payload });
    };
    return (
      <View style={st.panel}>
        <Text style={textStyles.muted}>{track === 'delay' ? 'FIVB 16.2 — delays are team sanctions.' : 'FIVB 21 — the referee picks the level by the offence.'} Who?</Text>
        <View style={st.chips}>
          {(['home', 'away'] as const).map((x) => <SelectChip key={x} label={nameOf(x)} active={side === x} onPress={() => { setSide(x); setPlayer(null); setLevel(null); }} />)}
        </View>
        {side && track === 'misconduct' && rosterOf(side).length > 0 && (
          <View style={st.chips}>
            {rosterOf(side).map((p) => <SelectChip key={p.id} label={p.fullName} active={player?.id === p.id} onPress={() => { setPlayer(player?.id === p.id ? null : p); setLevel(null); }} />)}
          </View>
        )}
        {side && (
          <>
            <Text style={st.suggest} accessibilityLiveRegion="polite">
              Suggested: {sanctionDef(suggested!)?.label}{so ? ` (${so} so far)` : ''}
            </Text>
            <View style={st.chips}>
              {VB_SANCTIONS.filter((d) => d.track === track).map((d) => (
                <SelectChip key={d.level} label={`${d.icon} ${d.label}`} active={chosen === d.level} onPress={() => setLevel(d.level)} />
              ))}
            </View>
            {track === 'misconduct' && (
              <View style={st.chips}>
                {VB_MISCONDUCT_REASONS.map((r) => <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? null : r)} />)}
              </View>
            )}
            {chosen && <Text style={st.effect}>{sanctionEffect(chosen, offender, other)}</Text>}
            {needsPlayer && !player && <Text style={textStyles.muted}>Pick the player who leaves the court.</Text>}
            <Button label={def ? `Apply: ${def.label}` : 'Apply'} variant={def?.effect === 'none' ? 'primary' : 'danger'}
              disabled={!def || (needsPlayer && !player)} onPress={() => void apply()} />
          </>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.grid}>
        <Tile icon="🟨" label="Sanction" hint="Warning → penalty → expulsion → DQ" active={open === 'misconduct'} onPress={() => toggle('misconduct')} />
        <Tile icon="⏱️" label="Delay" hint="Warning, then penalty" active={open === 'delay'} onPress={() => toggle('delay')} />
      </View>
      {open && panel(open)}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  panel: { gap: theme.spacing(2) },
  suggest: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  effect: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
});
