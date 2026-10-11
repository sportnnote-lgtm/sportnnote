/** SD-126 — two cards on a sport's settings page:
 *  - the suspension rule for hockey, handball, basketball and kabaddi (football
 *    keeps its own SD-70 card) — every send-off's ban and the caution count;
 *  - the walkover / forfeit score the points table counts (federation default,
 *    the organiser's own, or off), with "Recalculate past walkovers" for an
 *    existing tournament (asks first). */
import React, { useState, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, FieldLabel, SelectChip, textStyles } from './ui';
import { askConfirm } from './ConfirmSheet';
import { notice } from '../core/confirm';
import { DISCIPLINE_SPECS, readSportRule, sportRuleText } from '../sports/discipline';
import { WALKOVER_SCORES, WALKOVER_SCORE_SPORTS, walkoverRuleFor, walkoverRuleText } from '../data/walkover';
import { recalcWalkovers } from '../data/repos';
import { tournamentDraft } from '../data/tournamentDraft';
import { getSport } from '../sports/registry';
import type { SportId } from '../core/types';

type Val = number | string | boolean;

export function SportDisciplineSettings({ sport, value, onChange }: { sport: SportId; value: Record<string, unknown>; onChange: (key: string, val: Val) => void }) {
  const spec = DISCIPLINE_SPECS[sport];
  if (!spec) return null;
  const rule = readSportRule(spec, value);
  return (
    <View style={st.card}>
      <FieldLabel hint={sportRuleText(sport, value)}>Discipline & suspensions</FieldLabel>
      {spec.sendOffs.map((o) => (
        <View key={o.key} style={{ gap: theme.spacing(2) }}>
          <FieldLabel>{o.ask}</FieldLabel>
          <View style={st.chips}>
            {[0, 1, 2, 3].map((n) => (
              <SelectChip key={n} label={n === 0 ? 'No ban' : `${n} match${n === 1 ? '' : 'es'} out`} active={rule.bans[o.key] === n} onPress={() => onChange(o.key, n)} />
            ))}
          </View>
        </View>
      ))}
      {spec.caution ? (
        <>
          <FieldLabel>{`${spec.caution.plural.charAt(0).toUpperCase()}${spec.caution.plural.slice(1)} that add up to a 1-match ban`}</FieldLabel>
          <View style={st.chips}>
            {[0, 2, 3, 4, 5].map((n) => <SelectChip key={n} label={n === 0 ? 'Off' : String(n)} active={rule.banYellows === n} onPress={() => onChange('banYellows', n)} />)}
          </View>
          {rule.banYellows > 0 && (
            <>
              <FieldLabel>Wipe the count</FieldLabel>
              <View style={st.chips}>
                <SelectChip label="Never" active={rule.yellowReset === 'never'} onPress={() => onChange('yellowReset', 'never')} />
                <SelectChip label="When the knockouts start" active={rule.yellowReset === 'groups'} onPress={() => onChange('yellowReset', 'groups')} />
                <SelectChip label="After the quarter-finals" active={rule.yellowReset === 'qf'} onPress={() => onChange('yellowReset', 'qf')} />
              </View>
            </>
          )}
        </>
      ) : null}
      <Text style={textStyles.muted}>{spec.source}. A ban is served in the team’s next matches. Picking a suspended player only shows a warning.</Text>
    </View>
  );
}

/** One-tap scores per sport (the federation default first). */
const CHOICES: Partial<Record<SportId, string[]>> = {
  football: ['3-0', '2-0', '1-0'],
  hockey: ['5-0', '3-0', '2-0'],
  handball: ['10-0', '5-0'],
  ice_hockey: ['5-0', '1-0'],
  netball: ['20-0', '10-0'],
  baseball: ['9-0', '7-0'],
  american_football: ['1-0', '2-0'],
  rugby: ['28-0', '20-0', '5-0'],
  basketball: ['20-0', '2-0'],
  volleyball: ['3-0', '2-0'],
  kabaddi: ['10-0', '5-0'],
};

/** The score chips: the federation default first, one-tap scores, "No score". */
function WalkoverChips({ sport, value: cur, onPick }: { sport: SportId; value: unknown; onPick: (v: string) => void }) {
  const base = WALKOVER_SCORES[sport];
  const choices = (CHOICES[sport] ?? []).filter((c) => !base || base.sets || c !== `${base.win}-${base.loss}`);
  return (
    <View style={st.chips}>
      {base ? <SelectChip label={base.sets ? `Federation (${base.source})` : `${base.win}-${base.loss} (${base.source})`} active={cur === undefined || cur === ''} onPress={() => onPick('')} /> : null}
      {choices.map((c) => <SelectChip key={c} label={c} active={cur === c} onPress={() => onPick(c)} />)}
      <SelectChip label="No score" active={cur === 'off' || (!base && (cur === undefined || cur === ''))} onPress={() => onPick(base ? 'off' : '')} />
    </View>
  );
}

/**
 * SD-140 (founder, 2026-10-11) — in the tournament form itself (create, and a
 * sport added on edit): one row per team sport asking for its walkover score,
 * prefilled with the federation default ("No score" allowed). Writes the
 * shared tournament draft (`formats[sport].walkoverScore`); the sport's
 * settings page keeps the full card for later edits.
 */
export function WalkoverSetupCard({ sports, onChanged }: { sports: SportId[]; onChanged?: () => void }) {
  useSyncExternalStore(tournamentDraft.subscribe, tournamentDraft.getVersion);
  const list = sports.filter((s) => WALKOVER_SCORE_SPORTS.includes(s));
  if (!list.length) return null;
  return (
    <View style={st.card} accessibilityLabel="Walkover scores">
      <FieldLabel hint="A walkover is a match a team didn’t turn up for.">Walkover scores — confirm for each sport</FieldLabel>
      {list.map((sport) => {
        const f = tournamentDraft.get(sport) as Record<string, unknown>;
        return (
          <View key={sport} style={{ gap: theme.spacing(1) }}>
            <Text style={textStyles.body}>{getSport(sport).icon} {getSport(sport).name} · {walkoverRuleText(sport, walkoverRuleFor(sport, f), f)}</Text>
            <WalkoverChips sport={sport} value={f.walkoverScore} onPick={(v) => { tournamentDraft.setField(sport, 'walkoverScore', v); onChanged?.(); }} />
          </View>
        );
      })}
      <Text style={textStyles.muted}>The score counts for the team in the table and on team pages — never for any player. Change it later in each sport’s settings.</Text>
    </View>
  );
}

export function WalkoverScoreSettings({ sport, value, onChange, tournamentId, savedFormat }: {
  sport: SportId;
  value: Record<string, unknown>;
  onChange: (key: string, val: Val) => void;
  /** an existing tournament: offer the recalculation */
  tournamentId?: string;
  /** the saved formats[sport] (recalculation uses what's saved) */
  savedFormat?: Record<string, unknown> | null;
}) {
  const [busy, setBusy] = useState(false);
  if (!WALKOVER_SCORE_SPORTS.includes(sport)) return null;
  const base = WALKOVER_SCORES[sport];
  const cur = value.walkoverScore;
  const rule = walkoverRuleFor(sport, value);
  const norm = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v));
  const unsaved = norm(savedFormat?.walkoverScore) !== norm(cur);
  const recalc = async () => {
    if (!tournamentId) return;
    const ok = await askConfirm({
      title: 'Recalculate past walkovers?',
      message: `Every walkover, conceded and awarded match of this sport in this tournament is counted again with “${walkoverRuleText(sport, walkoverRuleFor(sport, savedFormat), savedFormat)}”. Goal / point difference and the table can change. Results and winners stay the same.`,
      yesLabel: 'Yes, recalculate',
      noLabel: 'No, leave them',
      tone: 'caution',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const n = await recalcWalkovers(tournamentId, sport);
      notice('Walkovers recalculated', n ? `${n} result${n === 1 ? ' now counts' : 's now count'} the new score.` : 'Nothing to change — every result already counts this score.');
    } catch (e) {
      notice('Couldn’t recalculate', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={st.card}>
      <FieldLabel hint={walkoverRuleText(sport, rule, value)}>Walkover / forfeit score</FieldLabel>
      <WalkoverChips sport={sport} value={cur} onPick={(v) => onChange('walkoverScore', v)} />
      <Text style={textStyles.muted}>
        {sport === 'volleyball'
          ? 'A walkover counts sets-to-win to 0 and every set at the set target to 0 (FIVB 6.4). A team that concedes during play keeps its sets and points; the other side is given what it needed.'
          : 'A walkover counts this score in the goal / point difference. A match conceded or awarded during play keeps a bigger winning margin.'}
        {base?.verify ? ' Check the score against your competition’s regulations.' : ''}
      </Text>
      {tournamentId ? (
        <>
          <Button label={busy ? 'Recalculating…' : 'Recalculate past walkovers'} variant="ghost" onPress={() => void recalc()} disabled={busy || unsaved} />
          {unsaved ? <Text style={textStyles.muted}>Save first, then recalculate.</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
