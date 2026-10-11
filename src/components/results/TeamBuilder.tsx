/** SD-137b — pick the teams of a team event seat by seat (the crew entry of
 *  SD-99, shared): "＋ Add a team from" a house / team, tap a seat then a
 *  player, "Fill empty seats" (the house's best in the individual event when
 *  there is one, else its roster), tap a filled seat to clear it. Used by the
 *  archery team / mixed team, shooting team of 3 and cycling team pursuit /
 *  team sprint setups. */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, textStyles } from '../ui';
import type { Player } from '../../core/types';

export interface TeamSource { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
export interface TeamDraft { id: string; source?: string; name: string; seats: (string | null)[] }

let seq = 0;
export const newTeamDraft = (src: TeamSource | undefined, existing: TeamDraft[], seats: number, members?: string[]): TeamDraft => {
  const n = existing.filter((c) => c.source === src?.key).length;
  return {
    id: `tm${++seq}`, source: src?.key, name: src ? `${src.name}${n ? ` ${String.fromCharCode(65 + n)}` : ''}` : `Team ${existing.length + 1}`,
    seats: Array.from({ length: seats }, (_, i) => members?.[i] ?? null),
  };
};

export function TeamBuilder({ sources, playerById, players, seatNames, fits, teams, onChange, suggest, hint }: {
  sources: TeamSource[];
  playerById: Map<string, Player>;
  players: Player[];
  /** "Archer 1" … / "Man", "Woman" / "Rider 1" … */
  seatNames: string[];
  /** may this player sit in seat `i` (gender / age)? */
  fits: (p: Player, seat: number) => boolean;
  teams: TeamDraft[];
  onChange: (next: TeamDraft[]) => void;
  /** a house's players best first (from the individual event) — "Fill" uses them first */
  suggest?: (src: TeamSource) => string[];
  hint?: string;
}) {
  const [active, setActive] = useState<{ team: string; seat: number } | null>(null);
  const [query, setQuery] = useState('');
  const taken = useMemo(() => new Set(teams.flatMap((t) => t.seats.filter((x): x is string => !!x))), [teams]);
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Player';
  const add = (src?: TeamSource) => {
    const t = newTeamDraft(src, teams, seatNames.length);
    onChange([...teams, t]);
    setActive({ team: t.id, seat: 0 });
  };
  const fill = (id: string) => {
    setActive(null);
    const used = new Set(teams.flatMap((t) => (t.id === id ? [] : t.seats.filter((x): x is string => !!x))));
    onChange(teams.map((t) => {
      if (t.id !== id) return t;
      const src = sources.find((s) => s.key === t.source);
      const order = [...(src && suggest ? suggest(src) : []), ...(src?.playerIds ?? [])];
      const mine = new Set(t.seats.filter((x): x is string => !!x));
      const seats = [...t.seats];
      seats.forEach((x, i) => {
        if (x) return;
        const pick = order.find((pid) => !used.has(pid) && !mine.has(pid) && !!playerById.get(pid) && fits(playerById.get(pid)!, i));
        if (pick) { seats[i] = pick; mine.add(pick); }
      });
      return { ...t, seats };
    }));
  };
  const assign = (pid: string) => {
    if (!active) return;
    const t = teams.find((x) => x.id === active.team);
    onChange(teams.map((x) => (x.id === active.team ? { ...x, seats: x.seats.map((s, i) => (i === active.seat ? pid : s)) } : x)));
    const nxt = t ? t.seats.findIndex((x, i) => i > active.seat && !x) : -1;
    setActive(nxt >= 0 ? { team: active.team, seat: nxt } : null);
  };
  const clearSeat = (team: string, seat: number) => {
    onChange(teams.map((t) => (t.id === team ? { ...t, seats: t.seats.map((x, i) => (i === seat ? null : x)) } : t)));
    setActive({ team, seat });
  };
  const pool = (src: TeamSource | undefined, seat: number) => {
    const q = query.trim().toLowerCase();
    const base = q ? players : src ? src.playerIds.map((id) => playerById.get(id)) : sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id)));
    const uniq = [...new Map(base.filter((p): p is Player => !!p).map((p) => [p.id, p])).values()];
    return uniq.filter((p) => p.fullName && !taken.has(p.id) && fits(p, seat) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 40);
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.label}>＋ Add a team from</Text>
      <View style={st.wrap}>
        {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={false} onPress={() => add(s)} />)}
        <SelectChip label="Any players" active={false} onPress={() => add()} />
      </View>
      {teams.map((t) => {
        const src = sources.find((s) => s.key === t.source);
        const open = active?.team === t.id;
        const missing = t.seats.filter((x) => !x).length;
        return (
          <View key={t.id} style={[st.team, open && { borderColor: theme.colors.primary }]}>
            <View style={st.head}>
              <TextInput style={[st.input, { flex: 1 }]} value={t.name} onChangeText={(v) => onChange(teams.map((x) => (x.id === t.id ? { ...x, name: v } : x)))} accessibilityLabel="Team name" />
              <SelectChip label="✕" active={false} onPress={() => { onChange(teams.filter((x) => x.id !== t.id)); if (open) setActive(null); }} />
            </View>
            <View style={st.wrap}>
              {seatNames.map((sn, i) => {
                const pid = t.seats[i];
                const on = open && active?.seat === i;
                return <SelectChip key={i} label={`${sn}: ${pid ? nameOf(pid).split(' ')[0] : '—'}`} active={on} onPress={() => (pid && !on ? clearSeat(t.id, i) : setActive({ team: t.id, seat: i }))} />;
              })}
            </View>
            {src && missing ? <SelectChip label={`Fill empty seats from ${src.name}${suggest ? ' (best first)' : ''}`} active={false} onPress={() => fill(t.id)} /> : null}
            {open ? (
              <>
                <Text style={textStyles.muted}>Tap a player for {seatNames[active!.seat]}{src ? ` (${src.name})` : ''}; tap a filled seat to clear it.</Text>
                <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
                <View style={st.wrap}>
                  {pool(src, active!.seat).map((p) => <SelectChip key={p.id} label={p.fullName} dotColor={p.houseColor} active={false} onPress={() => assign(p.id)} />)}
                </View>
              </>
            ) : null}
            <Text style={textStyles.muted}>{missing ? `${missing} seat${missing === 1 ? '' : 's'} to fill.` : '✓ Team complete.'}</Text>
          </View>
        );
      })}
      {!teams.length && <Text style={textStyles.muted}>{hint ?? 'Add a team from a house, then pick its members seat by seat — or “Fill empty seats”.'}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  team: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing(2.5), gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
