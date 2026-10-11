/**
 * SD-130 — "Age groups: ages on 31 Dec 2026 · Change". The organiser picks the
 * day ages are counted on for this meet: 31 Dec of the meet year (World
 * Athletics / World Aquatics), 1 Jan, the meet's first day, or a school
 * association's cut-off date. Saved on the tournament's sport format (`ageOn`).
 * SD-153: the meet's market adds its school-year date (31 Aug for UK and
 * British-curriculum schools, 1 Sep in the US) and its own help text.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, FormError, SelectChip, TextField, textStyles } from '../ui';
import { ageBasisOptions, ageCutoff, cutoffLabel, type AgeBasis, isBoardCutoff, SCHOOL_YEAR_BASES } from '../../core/age';
import { MARKETS } from '../../core/markets';
import { bandRule } from '../../core/divisions';
import { useTournamentMarket } from '../../data/useMarket';
import { patchTournamentFormat } from '../../data/repos';
import type { Tournament } from '../../core/types';

export function AgeBasisNote({ tournament, sport, basis, cutoff, canEdit, onSaved }: {
  tournament: Tournament | null | undefined;
  sport: string;
  basis: AgeBasis;
  cutoff: string;
  canEdit: boolean;
  /** after a save — the screen reloads the tournament */
  onSaved?: (basis: AgeBasis) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<AgeBasis>(basis);
  const [custom, setCustom] = useState(/^\d{4}-\d{2}-\d{2}$/.test(basis) ? basis : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCustom = pick === 'custom' || /^\d{4}-\d{2}-\d{2}$/.test(pick);
  const market = MARKETS[useTournamentMarket(tournament)];
  const options = ageBasisOptions(market.ageCutoff, basis);
  const schoolYear = SCHOOL_YEAR_BASES.find((b) => b.value === basis);
  // An example band from the market beyond "U14" (e.g. "12 & Under", "C Division").
  const exampleBand = market.ageBands.find((b) => !/^U\d+$/.test(b) && b !== 'Open' && bandRule(b));

  const save = async () => {
    const value = isCustom ? custom.trim() : pick;
    if (isCustom && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(value).getTime()))) { setError('Type the cut-off date as YYYY-MM-DD, e.g. 2026-10-01.'); return; }
    if (isCustom && !isBoardCutoff(value)) { setError('Use the 1st or the last day of a month (e.g. 2026-10-01 or 2026-08-31) — that is what school associations use.'); return; }
    if (!tournament) return;
    setBusy(true); setError(null);
    try {
      await patchTournamentFormat(tournament.id, sport, { ageOn: value === 'dec31' ? undefined : value });
      setOpen(false);
      onSaved?.(value);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.row}>
        <Text style={[textStyles.muted, { flex: 1 }]}>Age groups use each athlete’s age on <Text style={st.bold}>{cutoffLabel(cutoff)}</Text>{basis === 'dec31' ? ' (31 Dec, World Athletics)' : schoolYear ? ` (${schoolYear.label})` : ''}.</Text>
        {canEdit && tournament && !open ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change the age cut-off date" onPress={() => { setPick(/^\d{4}-/.test(basis) ? 'custom' : basis); setOpen(true); }}>
            <Text style={st.link}>Change</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <View style={st.box}>
          <Text style={st.bold}>Count ages on</Text>
          <View style={st.chips}>
            {options.map((o) => {
              const day = cutoffLabel(ageCutoff(o.value, tournament?.startDate));
              const sy = SCHOOL_YEAR_BASES.some((b) => b.value === o.value);
              return <SelectChip key={o.value} label={o.value === 'dec31' ? `${day} (World Athletics)` : o.value === 'meet' ? `Meet day · ${day}` : sy ? `${day} (school year start)` : day} active={pick === o.value} onPress={() => setPick(o.value)} />;
            })}
            <SelectChip label="Another date" active={isCustom} onPress={() => setPick('custom')} />
          </View>
          {isCustom && <TextField label="Cut-off date (YYYY-MM-DD)" value={custom} onChange={setCustom} placeholder="2026-10-01" autoCapitalize="none" />}
          <Text style={textStyles.muted}>An athlete is in U14 if they are 13 or younger on this day{exampleBand ? `; in ${exampleBand}, ${bandRule(exampleBand)!.replace(' on the cut-off day', '')}` : ''}. {market.cutoffHint}</Text>
          <FormError message={error} />
          <View style={st.chips}>
            <Button label={busy ? 'Saving…' : 'Save cut-off'} onPress={() => void save()} disabled={busy} />
            <Button label="Cancel" variant="ghost" onPress={() => { setOpen(false); setError(null); }} />
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  bold: { color: theme.colors.text, fontWeight: '800' },
  link: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
