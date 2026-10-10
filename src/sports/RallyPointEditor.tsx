/**
 * "🗓 Correct the timeline" for rally / running-point sports (volleyball, tennis,
 * badminton). Lists every scored point newest-first and lets the scorer:
 *   • ✕ Remove a point that shouldn't have counted,
 *   • ✎ Edit who won it / which player / point-vs-ace,
 *   • ＋ Insert a point the scorer missed, at the right spot in the sequence.
 * Any change rebuilds the corrected point list and dispatches one `EDIT_LOG`
 * (the reducer replays it — score, sets and box score all re-derive) plus
 * `STAT_ADJUST` deltas so player-profile tallies add up. See `rallyEdit.ts`.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { pointInputs, isPointKind, reconcileStatActions, defaultCredits, type PointCredits, type PointInput, type PointKind } from './rallyEdit';

/** One choosable point type in the editor. `credited: false` = nobody on the
 *  scoring side gets credit (an opponent's error) → no player picker. */
export interface EditorKind { kind: PointKind; label: string; credited: boolean }

/** Timeline-row icon per kind (a sport's normal point uses its own `pointIcon`). */
const ROW_ICON: Partial<Record<PointKind, string>> = { ace: '🎯', block: '🧱', attack: '⚡', opperror: '🎁', serveerror: '🎁' };

interface Draft {
  mode: 'edit' | 'insert';
  index: number; // edit → the row; insert → splice AFTER this index (-1 = at start)
  side: 'home' | 'away';
  kind: PointKind;
  playerId?: string;
  playerName?: string;
}

export function RallyPointEditor({
  events,
  homeName,
  awayName,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  homeRoster = [],
  awayRoster = [],
  dispatch,
  hasAce,
  pointIcon,
  periodLabel,
  kinds,
  defaultKind = 'point',
  creditsOf = defaultCredits,
}: {
  events: LiveEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  dispatch: (a: ScoreAction) => void;
  /** does this sport distinguish aces? (volleyball/tennis yes, badminton no) */
  hasAce: boolean;
  /** icon for a normal point (🏐 / 🎾 / 🏸) — an ace always shows 🎯 */
  pointIcon: string;
  /** label for the period a point sits in, from its event (Set 2 / Game 1) */
  periodLabel: (e: LiveEvent) => string;
  /** the point types to choose from (volleyball: Attack/Block/Ace/Opp. error…).
   *  Default: Point + Ace when `hasAce`. */
  kinds?: EditorKind[];
  /** the type an inserted point starts as */
  defaultKind?: PointKind;
  /** the profile stats each kind credits — kept in step with how the sport
   *  dispatches, so a correction reconciles careers exactly (see rallyEdit). */
  creditsOf?: PointCredits;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const choices: EditorKind[] = kinds ?? (hasAce
    ? [{ kind: 'point', label: `${pointIcon} Point`, credited: true }, { kind: 'ace', label: '🎯 Ace', credited: true }]
    : []);
  const isCredited = (k: PointKind) => choices.find((c) => c.kind === k)?.credited ?? true;
  const list = pointInputs(events); // forward order; index i ↔ i-th point event
  const pointEvents = events.filter((e) => isPointKind(e.kind) && e.side); // must match `list` order
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const rosterFor = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);

  // Commit a rewritten point list: replay it (EDIT_LOG) and reconcile profiles.
  const commit = (next: PointInput[]) => {
    dispatch({ type: 'EDIT_LOG', payload: { points: next } });
    for (const a of reconcileStatActions(list, next, rosterId, creditsOf)) dispatch(a);
    setDraft(null);
  };

  const remove = (index: number) => commit(list.filter((_, i) => i !== index));

  const saveDraft = () => {
    if (!draft) return;
    // An uncredited kind (an opponent's error) never carries a player.
    const credited = isCredited(draft.kind);
    const item: PointInput = {
      side: draft.side, kind: choices.length ? draft.kind : 'point',
      playerName: credited ? draft.playerName : undefined, playerId: credited ? draft.playerId : undefined,
    };
    if (draft.mode === 'edit') {
      commit(list.map((p, i) => (i === draft.index ? item : p)));
    } else {
      const next = [...list];
      next.splice(draft.index + 1, 0, item);
      commit(next);
    }
  };

  const beginEdit = (index: number) => {
    const p = list[index];
    setDraft({ mode: 'edit', index, side: p.side, kind: p.kind, playerName: p.playerName, playerId: rosterId(p.playerName) });
  };
  const beginInsert = (afterIndex: number) =>
    setDraft({ mode: 'insert', index: afterIndex, side: 'home', kind: defaultKind, playerName: undefined, playerId: undefined });

  if (pointEvents.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={st.label}>🗓 Correct the timeline</Text>
        <Button label={open ? 'Done' : 'Edit'} variant="ghost" onPress={() => { setOpen((v) => !v); setDraft(null); }} />
      </View>

      {open && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.meta}>Remove a point that shouldn&apos;t have counted, Edit who won it, or Insert one you missed — the score, sets and player stats all re-adjust.</Text>

          {draft ? (
            <View style={st.draftBox}>
              <Text style={st.label}>{draft.mode === 'edit' ? '✎ Edit this point' : '＋ Insert a missed point'}</Text>
              <Text style={st.meta}>Who won the rally?</Text>
              <View style={st.chips}>
                <SelectChip label={homeName} active={draft.side === 'home'} onPress={() => setDraft({ ...draft, side: 'home', playerId: undefined, playerName: undefined })} />
                <SelectChip label={awayName} active={draft.side === 'away'} onPress={() => setDraft({ ...draft, side: 'away', playerId: undefined, playerName: undefined })} />
              </View>
              {choices.length > 0 && (
                <>
                  <Text style={st.meta}>Point type</Text>
                  <View style={st.chips}>
                    {/* a legacy "Point" (outcome not recorded) stays choosable on the point that has it */}
                    {draft.kind === 'point' && !choices.some((c) => c.kind === 'point') && (
                      <SelectChip label={`${pointIcon} Point`} active onPress={() => undefined} />
                    )}
                    {choices.map((c) => (
                      <SelectChip key={c.kind} label={c.label} active={draft.kind === c.kind} onPress={() => setDraft({ ...draft, kind: c.kind })} />
                    ))}
                  </View>
                </>
              )}
              {isCredited(draft.kind) ? (
                <>
                  <Text style={st.meta}>Which player? (optional)</Text>
                  <View style={st.chips}>
                    {rosterFor(draft.side).map((p) => (
                      <SelectChip key={p.id} label={p.fullName} active={draft.playerId === p.id}
                        onPress={() => setDraft({ ...draft, playerId: draft.playerId === p.id ? undefined : p.id, playerName: draft.playerId === p.id ? undefined : p.fullName })} />
                    ))}
                    <SelectChip label="Team (no player)" active={!draft.playerId} onPress={() => setDraft({ ...draft, playerId: undefined, playerName: undefined })} />
                  </View>
                </>
              ) : (
                <Text style={st.meta}>An opponent&apos;s error — no player is credited.</Text>
              )}
              <View style={st.row}>
                <Button label="Save" variant={draft.side} style={{ flex: 1 }} onPress={saveDraft} />
                <Button label="Cancel" variant="ghost" onPress={() => setDraft(null)} />
              </View>
            </View>
          ) : (
            <Text style={st.insertTop} onPress={() => beginInsert(-1)}>＋ Insert a point at the very start</Text>
          )}

          {pointEvents
            .map((e, i) => ({ e, i }))
            .reverse()
            .map(({ e, i }) => {
              const side = e.side as 'home' | 'away';
              return (
                <View key={e.id} style={st.editRow}>
                  <View style={[st.dot, { backgroundColor: side === 'home' ? homeColor : awayColor }]} />
                  <Text style={st.period}>{periodLabel(e)}</Text>
                  <Text style={st.rowLabel} numberOfLines={1}>
                    {ROW_ICON[e.kind as PointKind] ?? pointIcon} {side === 'home' ? homeName : awayName}{e.playerName ? ` · ${e.playerName}` : e.kind === 'opperror' || e.kind === 'serveerror' ? ` · ${e.label}` : ''}
                  </Text>
                  {!draft && (
                    <>
                      <Text style={st.insert} onPress={() => beginInsert(i)}>＋</Text>
                      <Text style={st.edit} onPress={() => beginEdit(i)}>✎</Text>
                      <Text style={st.remove} onPress={() => remove(i)}>✕</Text>
                    </>
                  )}
                </View>
              );
            })}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  draftBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  insertTop: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(1) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  period: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', width: 46 },
  rowLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  insert: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800', paddingHorizontal: theme.spacing(1) },
  edit: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', paddingHorizontal: theme.spacing(1) },
  remove: { color: theme.colors.danger, fontSize: theme.font.body, fontWeight: '800', paddingHorizontal: theme.spacing(1) },
});
