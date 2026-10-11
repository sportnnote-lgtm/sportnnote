/**
 * SD-81 — volleyball's optional "Detailed stats" row under the point panels.
 * Off by default (the point buttons stay one or two taps). On, it adds:
 *   - after a Block point: "Who was blocked?" (the attacker — an attack attempt
 *     that was blocked); skippable, a second tap replaces it;
 *   - "⚡ Attack in play" per side: an attack swing that didn't end the rally
 *     (dug / kept alive) — no score change;
 *   - "📥 Reception" per side (optional): grade (Perfect # / Good + / Poor −),
 *     then the receiver.
 * Kills come from Attack points and attack errors from "Opp. fault › Attack
 * out" with the attacker named, so a detailed match needs no extra tap for
 * those. Every entry is a VB_DETAIL (undo removes it). See ./detail.ts.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import type { ScoreAction } from '../types';
import type { VolleyballState } from './engine';
import { blockedFor, detailOn, lastBlock, RECEPTION_GRADES, type ReceptionGrade, type VbDetailKind } from './detail';

type Side = 'home' | 'away';
interface SideInfo { side: Side; name: string; color: string; court: Player[] }

export function VolleyballDetailRow({ state: s, dispatch, home, away }: {
  state: VolleyballState;
  dispatch: (a: ScoreAction) => void;
  home: SideInfo;
  away: SideInfo;
}) {
  const on = detailOn(s);
  const [open, setOpen] = useState<{ side: Side; kind: 'inplay' | 'reception'; q?: ReceptionGrade } | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);
  // the last entry's confirmation, until the next point is scored
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const info = (sd: Side) => (sd === 'home' ? home : away);
  const send = (kind: VbDetailKind, side: Side, p: Player, q?: ReceptionGrade) => {
    dispatch({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: p.id, playerName: p.fullName }, ...(q ? { q } : {}) } });
    setOpen(null);
    const text = kind === 'inplay' ? `✓ Attack in play · ${p.fullName}` : kind === 'reception' ? `✓ Reception ${RECEPTION_GRADES.find((g) => g.key === q)?.sign ?? ''} · ${p.fullName}` : `✓ Blocked · ${p.fullName}`;
    setToast({ text, n: s.events.length });
  };

  const toggle = (
    <View style={st.toggleRow}>
      <Text style={st.meta}>🔎 Detailed stats (optional)</Text>
      <SelectChip label={on ? 'On' : 'Off'} active={on} onPress={() => { dispatch({ type: 'SET_DETAIL', payload: { detail: !on } }); setOpen(null); setToast(null); }} />
    </View>
  );
  if (!on || s.ended) return <View style={st.box}>{toggle}</View>;

  // "Who was blocked?" for the last point, when it was a Block
  const blk = lastBlock(s);
  const blkKey = blk ? `${blk.set}:${blk.at}` : null;
  const named = blk ? blockedFor(s, blk) : undefined;
  const attackers = blk ? info(blk.side === 'home' ? 'away' : 'home') : null;

  return (
    <View style={st.box} accessibilityLabel="Detailed stats">
      {toggle}
      <Text style={st.meta}>Kills come from ⚡ Attack points; attack errors from 🚩 Opp. fault › Attack out with the attacker named.</Text>
      {blk && attackers && attackers.court.length > 0 && skipped !== blkKey && (
        <View style={{ gap: theme.spacing(1) }}>
          <View style={st.head}>
            <Text style={st.label}>🧱 Who was blocked? <Text style={st.meta}>(optional)</Text></Text>
            {!named && <Text style={st.link} accessibilityRole="button" onPress={() => setSkipped(blkKey)}>Skip</Text>}
          </View>
          <View style={st.chips}>
            {attackers.court.map((p) => (
              <SelectChip key={p.id} label={p.fullName} dotColor={attackers.color} active={named?.playerId === p.id || (!named?.playerId && named?.playerName === p.fullName)}
                onPress={() => send('blocked', attackers.side, p)} />
            ))}
          </View>
        </View>
      )}
      <View style={st.chips}>
        {[home, away].map((x) => (
          <React.Fragment key={x.side}>
            <SelectChip label={`⚡ Attack in play · ${x.name}`} dotColor={x.color} active={open?.side === x.side && open.kind === 'inplay'}
              onPress={() => setOpen(open?.side === x.side && open.kind === 'inplay' ? null : { side: x.side, kind: 'inplay' })} />
            <SelectChip label={`📥 Reception · ${x.name}`} dotColor={x.color} active={open?.side === x.side && open.kind === 'reception'}
              onPress={() => setOpen(open?.side === x.side && open.kind === 'reception' ? null : { side: x.side, kind: 'reception' })} />
          </React.Fragment>
        ))}
      </View>
      {open && open.kind === 'reception' && (
        <View style={st.chips}>
          <Text style={[st.meta, { alignSelf: 'center' }]}>Grade:</Text>
          {RECEPTION_GRADES.map((g) => (
            <SelectChip key={g.key} label={`${g.sign} ${g.label}`} active={open.q === g.key} onPress={() => setOpen({ ...open, q: g.key })} />
          ))}
        </View>
      )}
      {open && (open.kind === 'inplay' || open.q) && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.meta}>{open.kind === 'inplay' ? 'Attacker (the rally goes on — no point):' : 'Received by:'}</Text>
          <View style={st.chips}>
            {info(open.side).court.length === 0
              ? <Text style={st.meta}>Add the squad to name players.</Text>
              : info(open.side).court.map((p) => (
                <SelectChip key={p.id} label={p.fullName} dotColor={info(open.side).color} active={false}
                  onPress={() => send(open.kind, open.side, p, open.q)} />
              ))}
          </View>
        </View>
      )}
      {toast && toast.n === s.events.length && <Text style={st.meta} accessibilityLiveRegion="polite">{toast.text}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
