/** SD-43 — format / ball filter chips for a tournament's or sport hub's
 *  leaderboards and the awards rankings (cricket: T20 / ODI / T10 / Box /
 *  Hundred / Long, Leather / Tennis ball). The same SD-25 line context the
 *  profile chips use, derived from the already-loaded matches + tournaments:
 *  a chip only filters lines, so switching makes no network call. Chips show
 *  only when the sport declares `leaderSplits` and the lines carry ≥ 2 values. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, textStyles } from './ui';
import { getTournaments } from '../data/repos';
import { contextsFor, scopeBySplits, type SplitDim, type SplitScope, type SplitSelection } from '../data/lineContext';
import { statSchema } from '../sports/statSchemas';
import type { Match, SportId, StatLine, Tournament } from '../core/types';

/** The scoped lines + chip state. `tournaments` = the ones the lines can come
 *  from (a tournament screen passes its own); absent = loaded once (sport hub
 *  across every tournament). */
export function useLeaderSplits(
  sport: SportId | undefined, lines: StatLine[], matches: Match[], tournaments?: Tournament[],
): SplitScope & { sel: SplitSelection; setSel: React.Dispatch<React.SetStateAction<SplitSelection>> } {
  const dims = (sport && statSchema(sport)?.leaderSplits) || [];
  const [loaded, setLoaded] = useState<Tournament[]>([]);
  const need = !tournaments && dims.length > 0;
  useEffect(() => {
    if (!need) return;
    let on = true;
    getTournaments({ includeDeleted: true }).then((t) => on && setLoaded(t)).catch(() => {});
    return () => { on = false; };
  }, [need]);
  const tours = tournaments ?? loaded;
  const [sel, setSel] = useState<SplitSelection>({});
  // a sport switch starts unfiltered
  useEffect(() => { setSel({}); }, [sport]);
  const ctxOf = useMemo(() => {
    if (!sport || !dims.length) return new Map();
    const mine = lines.filter((l) => l.sport === sport);
    return contextsFor(mine, new Map(matches.map((m) => [m.id, m])), new Map(tours.map((t) => [t.id, t])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, dims.length, lines, matches, tours]);
  const scope = useMemo(
    () => (sport ? scopeBySplits(lines, ctxOf, sport, dims, sel) : { options: [], active: {}, lines, label: '' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, ctxOf, sport, dims.length, sel],
  );
  return { ...scope, sel, setSel };
}

/** The chip rows: one chip per split ("Format: All ▾"), its values under it. */
export function LeaderSplitChips({ scope, note }: { scope: ReturnType<typeof useLeaderSplits>; note?: string }) {
  const [open, setOpen] = useState<SplitDim | null>(null);
  const { options, active, setSel, label } = scope;
  if (!options.length) return null;
  const filtered = Object.keys(active).length > 0;
  const o = options.find((x) => x.dim === open);
  const pick = (dim: SplitDim, k?: string) => setSel((p) => ({ ...p, [dim]: k }));
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
        {options.map((x) => {
          const cur = x.values.find((v) => v.key === active[x.dim]);
          return (
            <SelectChip
              key={x.dim}
              label={`${x.label}: ${cur?.label ?? 'All'} ${open === x.dim ? '▴' : '▾'}`}
              active={!!cur}
              onPress={() => setOpen(open === x.dim ? null : x.dim)}
            />
          );
        })}
        {filtered && <SelectChip label="✕ Clear" active={false} onPress={() => { setSel({}); setOpen(null); }} />}
      </ScrollView>
      {o ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
          <SelectChip label="All" active={active[o.dim] == null} onPress={() => pick(o.dim, undefined)} />
          {o.values.map((v) => (
            <SelectChip key={v.key} label={`${v.label} · ${v.count}`} active={active[o.dim] === v.key} onPress={() => pick(o.dim, v.key)} />
          ))}
        </ScrollView>
      ) : null}
      {filtered ? <Text style={textStyles.muted}>{note ? `${note} ` : ''}{label} matches only.</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
});
