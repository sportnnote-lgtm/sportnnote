/**
 * SD-58 / SD-71 — the scorer's serve, rotation and substitution panel:
 *  - the toss ("🪙 Who serves first?") per set when it isn't implied (FIVB 7.1),
 *    then "🏐 Rohan serves" from the rotation;
 *  - a small court per side (positions IV-III-II at the net, V-VI-I behind;
 *    I serves), set with "Set rotation" (tap players in serving order, mark up
 *    to 2 liberos);
 *  - "🔁 Sub" per side with the 6-per-set count; anything that looks illegal
 *    (FIVB 15.6 / 19.3) asks before it's recorded — the 7th sub as an
 *    exceptional (injury) sub.
 * All optional: a scorer who ignores it scores exactly as before.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, Button } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import type { LineupSlot, Player } from '../../core/types';
import type { ScoreAction } from '../types';
import type { CourtPlayer, VolleyballState } from './engine';
import {
  checkSub, firstServer, liberosOf, rotationFor, serveTracked, setNoOf, POSITIONS, SUBS_PER_SET,
  type SubKind, type VbTrack,
} from './rotation';

type Side = 'home' | 'away';
const cp = (p: Player): CourtPlayer => ({ id: p.id, name: p.fullName });
export const asPlayer = (c: CourtPlayer, roster: Player[]): Player => roster.find((p) => p.id === c.id) ?? ({ id: c.id, fullName: c.name } as Player);
const first = (name: string) => name.split(' ')[0] || name;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export interface SideInfo {
  side: Side;
  name: string;
  color: string;
  roster: Player[];
  lineup: LineupSlot[];
  /** on court now (tracked), else null */
  court: Player[] | null;
}

export function ServePanel({ s, track, dispatch, home, away }: {
  s: VolleyballState;
  track: VbTrack;
  dispatch: (a: ScoreAction) => void;
  home: SideInfo;
  away: SideInfo;
}) {
  const [toss, setToss] = useState(false);
  const [open, setOpen] = useState<{ kind: 'rotation' | 'sub'; side: Side } | null>(null);
  if (s.ended) return null;
  const setNo = setNoOf(s);
  const tracked = serveTracked(s);
  const fs = tracked ? firstServer(s, setNo) : null;
  const playedInSet = s.events.some((e) => e.set === setNo && e.side && e.kind && e.kind !== 'timeout');
  const info = (sd: Side) => (sd === 'home' ? home : away);
  const askToss = toss || (tracked && !fs && !playedInSet) || (!tracked && !s.events.length);
  const decider = s.setsToWin > 1 && setNo === s.setsToWin * 2 - 1;
  const tossTitle = !tracked && !s.events.length ? '🪙 Toss — who serves first?'
    : decider ? '🪙 Deciding set — new toss: who serves first?'
    : playedInSet ? `Who served first in Set ${setNo}?` : `🪙 Who serves first in Set ${setNo}?`;
  const serving = track.serving;
  const srv = track.server;
  return (
    <View style={css.box}>
      {askToss ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={css.title}>{tossTitle}</Text>
          {!tracked && <Text style={css.hint}>Optional — names the server, keeps the rotation and counts serve errors per player.</Text>}
          <View style={css.row}>
            {(['home', 'away'] as const).map((sd) => (
              <Button key={sd} label={`🏐 ${info(sd).name}`} variant="ghost" style={{ flex: 1 }}
                onPress={() => { dispatch({ type: 'SET_SERVE', payload: { side: sd, set: setNo } }); setToss(false); }} />
            ))}
          </View>
          {toss && <SelectChip label="Cancel" active={false} onPress={() => setToss(false)} />}
        </View>
      ) : tracked ? (
        <View style={css.row}>
          <Text style={[css.serving, { flex: 1 }]} accessibilityLiveRegion="polite">
            {serving ? `🏐 ${srv ? `${srv.name} serves · ${info(serving).name}` : `${info(serving).name} serves`}` : '🏐 Server not known'}
          </Text>
          <SelectChip label={playedInSet ? 'Fix first server' : 'Change'} active={false} onPress={() => setToss(true)} />
        </View>
      ) : (
        <SelectChip label="🏐 Track serve, rotation & subs" active={false} onPress={() => setToss(true)} />
      )}
      {(tracked || s.rotation || s.subs?.length) && (['home', 'away'] as const).map((sd) => {
        const x = info(sd);
        const ordered = track.ordered[sd] ? track.court[sd] : null;
        const rot = rotationFor(s, setNo, sd);
        const libs = new Set(liberosOf(s, sd).map((p) => p.id));
        const used = track.subsUsed[sd];
        const canSub = !!x.court && x.court.length > 0;
        if (open?.side === sd && open.kind === 'rotation') {
          return <RotationPicker key={sd} info={x} size={s.beach ? 2 : 6} setNo={setNo} midSet={playedInSet}
            current={ordered ?? (rot?.from === setNo ? rot.players : null)} carried={rot?.players ?? null} liberos={liberosOf(s, sd)}
            onSave={(players, liberos) => { dispatch({ type: 'SET_ROTATION', payload: { team: sd, set: setNo, players, liberos } }); setOpen(null); }}
            onCancel={() => setOpen(null)} />;
        }
        if (open?.side === sd && open.kind === 'sub' && x.court) {
          return <SubPicker key={sd} s={s} info={x} court={x.court} libs={libs} dispatch={dispatch} onDone={() => setOpen(null)} />;
        }
        return (
          <View key={sd} style={[css.side, { borderLeftColor: x.color }]}>
            <Text style={css.label}>{x.name}{rot ? ` · rotation${rot.from < setNo ? ` (from Set ${rot.from})` : ''}` : ''} · subs {used}/{SUBS_PER_SET}</Text>
            {ordered && <MiniCourt players={ordered} libs={libs} serving={serving === sd} color={x.color} />}
            <View style={css.row}>
              <SelectChip label={rot ? '↻ Rotation…' : '↻ Set rotation (I–VI)'} active={false} onPress={() => setOpen({ kind: 'rotation', side: sd })} />
              {canSub && <SelectChip label="🔁 Sub" active={false} onPress={() => setOpen({ kind: 'sub', side: sd })} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Positions as seen from behind the team's own court: net on top,
 *  IV · III · II in front, V · VI · I behind (I serves). */
function MiniCourt({ players, libs, serving, color }: { players: CourtPlayer[]; libs: Set<string>; serving: boolean; color: string }) {
  if (players.length !== 6) {
    return <Text style={css.hint}>{players.map((p, i) => `${POSITIONS[i] ?? i + 1} ${first(p.name)}${i === 0 && serving ? ' 🏐' : ''}`).join(' · ')}</Text>;
  }
  const cell = (i: number) => {
    const p = players[i];
    const srv = i === 0 && serving;
    return (
      <View key={i} style={[css.cell, srv && { backgroundColor: color + '33', borderColor: color }]} accessibilityLabel={`Position ${POSITIONS[i]}: ${p.name}${libs.has(p.id) ? ', libero' : ''}${srv ? ', serving' : ''}`}>
        <Text style={css.pos}>{POSITIONS[i]}{libs.has(p.id) ? ' · L' : ''}{srv ? ' 🏐' : ''}</Text>
        <Text style={css.pname} numberOfLines={1}>{first(p.name)}</Text>
      </View>
    );
  };
  return (
    <View style={css.court}>
      <Text style={css.net}>— net —</Text>
      <View style={css.courtRow}>{[3, 2, 1].map(cell)}</View>
      <View style={css.courtRow}>{[4, 5, 0].map(cell)}</View>
    </View>
  );
}

function RotationPicker({ info, size, setNo, midSet, current, carried, liberos, onSave, onCancel }: {
  info: SideInfo; size: number; setNo: number; midSet: boolean;
  current: CourtPlayer[] | null; carried: CourtPlayer[] | null; liberos: CourtPlayer[];
  onSave: (players: CourtPlayer[], liberos: CourtPlayer[]) => void; onCancel: () => void;
}) {
  const { roster, lineup } = info;
  const lineupIds = lineup.filter((sl) => sl.playerId && sl.position !== 'L').map((sl) => sl.playerId!);
  const libSlot = lineup.filter((sl) => sl.playerId && sl.position === 'L').map((sl) => sl.playerId!);
  const byId = (id: string) => roster.find((p) => p.id === id);
  const pre = (current ?? carried)?.map((c) => c.id) ?? (info.court && info.court.length <= size ? info.court.map((p) => p.id) : lineupIds);
  const [order, setOrder] = useState<string[]>(pre.filter((id) => byId(id)).slice(0, size));
  const [libs, setLibs] = useState<string[]>((liberos.length ? liberos.map((p) => p.id) : libSlot).filter((id) => byId(id)));
  const n = Math.min(size, roster.length);
  const free = roster.filter((p) => !order.includes(p.id) && !libs.includes(p.id));
  return (
    <View style={[css.side, { borderLeftColor: info.color }]}>
      <Text style={css.label}>{info.name} — Set {setNo} rotation{midSet ? ' (from now)' : ''}</Text>
      <Text style={css.hint}>{midSet ? 'Where they stand now — tap players from position I (back right, serves next when you have the serve), then II, III…' : 'Tap players in serving order: I serves first, then II, III… (position I = back right).'}</Text>
      <View style={css.row}>
        {order.map((id, i) => <SelectChip key={id} label={`${POSITIONS[i] ?? i + 1} · ${byId(id)?.fullName ?? '?'} ✕`} active dotColor={info.color} onPress={() => setOrder(order.filter((x) => x !== id))} />)}
        {order.length < n && <Text style={css.next}>{POSITIONS[order.length] ?? order.length + 1}: tap a player ↓</Text>}
      </View>
      {order.length < n && (
        <View style={css.row}>
          {free.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} dotColor={info.color} onPress={() => setOrder([...order, p.id])} />)}
        </View>
      )}
      <Text style={css.hint}>Libero (up to 2 — not in the rotation; can't serve or attack above the net)</Text>
      <View style={css.row}>
        {roster.filter((p) => !order.includes(p.id)).map((p) => (
          <SelectChip key={p.id} label={`${libs.includes(p.id) ? 'L · ' : ''}${p.fullName}`} active={libs.includes(p.id)}
            onPress={() => setLibs(libs.includes(p.id) ? libs.filter((x) => x !== p.id) : libs.length < 2 ? [...libs, p.id] : libs)} />
        ))}
      </View>
      <View style={css.row}>
        <Button label={`✓ Save rotation${order.length < n ? ` (${order.length}/${n})` : ''}`} style={{ flex: 1 }} disabled={order.length < n || n === 0}
          onPress={() => onSave(order.map((id) => cp(byId(id)!)), libs.map((id) => cp(byId(id)!)))} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

function SubPicker({ s, info, court, libs, dispatch, onDone }: {
  s: VolleyballState; info: SideInfo; court: Player[]; libs: Set<string>;
  dispatch: (a: ScoreAction) => void; onDone: () => void;
}) {
  const [off, setOff] = useState<Player | null>(null);
  const [injury, setInjury] = useState(false);
  const on = new Set(court.map((p) => p.id));
  const bench = info.roster.filter((p) => !on.has(p.id));
  const record = async (inP: Player) => {
    if (!off) return;
    const want: SubKind | undefined = injury ? 'exceptional' : undefined;
    const c = checkSub(s, info.side, cp(off), cp(inP), want);
    let kind = c.kind;
    if (c.overLimit && kind === 'regular') {
      const ok = await askConfirm({
        title: `${ordinal(c.used + 1)} substitution?`,
        message: `This would be the ${ordinal(c.used + 1)} substitution — only ${SUBS_PER_SET} per set. Allowed only as an exceptional sub (injury, FIVB 15.7). Record it as exceptional?`,
        yesLabel: 'Yes, exceptional sub', noLabel: 'No, cancel', tone: 'caution',
      });
      if (!ok) return;
      kind = 'exceptional';
    } else if (c.issues.length) {
      const ok = await askConfirm({
        title: kind === 'libero' ? 'Libero replacement looks illegal' : 'Substitution looks illegal',
        message: `${c.issues.join('. ')}. Record it anyway?`,
        yesLabel: 'Record anyway', noLabel: 'No, cancel', tone: 'caution',
      });
      if (!ok) return;
    }
    dispatch({ type: 'SUB', side: info.side, payload: { off: cp(off), on: cp(inP), kind } });
    onDone();
  };
  return (
    <View style={[css.side, { borderLeftColor: info.color }]}>
      <Text style={css.label}>🔁 {info.name} substitution</Text>
      {!off ? (
        <>
          <Text style={css.hint}>Who goes off?</Text>
          <View style={css.row}>{court.map((p) => <SelectChip key={p.id} label={`${libs.has(p.id) ? 'L · ' : ''}${p.fullName}`} active={false} dotColor={info.color} onPress={() => setOff(p)} />)}</View>
        </>
      ) : (
        <>
          <Text style={css.hint}>Who comes on for {off.fullName}?</Text>
          <View style={css.row}>
            {bench.map((p) => <SelectChip key={p.id} label={`${libs.has(p.id) ? 'L · ' : ''}${p.fullName}`} active={false} dotColor={info.color} onPress={() => { void record(p); }} />)}
            {bench.length === 0 && <Text style={css.hint}>No one on the bench.</Text>}
          </View>
          <View style={css.row}>
            <SelectChip label="🩹 Injury (exceptional sub)" active={injury} onPress={() => setInjury(!injury)} />
            <SelectChip label="← Back" active={false} onPress={() => setOff(null)} />
          </View>
        </>
      )}
      <SelectChip label="Cancel" active={false} onPress={onDone} />
    </View>
  );
}

const css = StyleSheet.create({
  box: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  serving: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small },
  next: { color: theme.colors.textMuted, fontSize: theme.font.small, alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  side: { gap: theme.spacing(2), borderLeftWidth: 3, paddingLeft: theme.spacing(3) },
  court: { gap: 4, maxWidth: 320 },
  net: { color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  courtRow: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: theme.colors.surfaceAlt },
  pos: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
});
