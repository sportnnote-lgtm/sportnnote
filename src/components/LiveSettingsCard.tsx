/** Live settings card (parity #14) — the one per-match settings mechanism
 *  (REVIEW Decision 2). Renders a sport's `liveSettings` on the Info tab and
 *  behind Quick options' ⚙️ tile.
 *   - config mode (football): each tap patches the match format at once.
 *   - event mode (cricket): the scorer edits a draft, then Apply — a format patch
 *     before play, else a logged event that applies from the next ball. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip, textStyles } from './ui';
import { FormatFieldEditor } from './FormatEditor';
import type { FormatField, FormatValue, LiveSettings, ScoreAction } from '../sports/types';
import { customCount, isBeforeStart, liveSettingsAccess, planLiveApply } from '../sports/liveSettings';

export interface LiveSettingsCardProps {
  settings: LiveSettings<any>;
  state: unknown;
  eventCount: number;
  canScore: boolean;
  canManage: boolean;
  complete: boolean;
  /** patch `matches.format` (and the local config, so the log replays with it) */
  onPatchFormat: (patch: Record<string, FormatValue>) => void;
  dispatch: (a: ScoreAction) => void;
  /** after an Apply — e.g. close the sheet / show a toast */
  onApplied?: (message: string) => void;
}

type Item = { kind: 'field'; field: FormatField } | { kind: 'group'; name: string; fields: FormatField[] };

export function LiveSettingsCard({ settings: ls, state, eventCount, canScore, canManage, complete, onPatchFormat, dispatch, onApplied }: LiveSettingsCardProps) {
  const current = ls.read(state);
  const curJson = JSON.stringify(current);
  const [draft, setDraft] = useState<Record<string, FormatValue>>(current);
  // Re-sync when the live values change (applied here, by undo, or by another device).
  useEffect(() => { setDraft(JSON.parse(curJson)); }, [curJson]);

  const before = isBeforeStart(ls, state, eventCount);
  const access = liveSettingsAccess({ mode: ls.mode, beforeStart: before, canScore, canManage, complete });
  const values = ls.mode === 'event' ? draft : current;
  const custom = customCount(ls, values);
  const dirty = JSON.stringify(draft) !== curJson;

  // Toggles sharing a `group` render as one chip row (at the first one's place).
  const items = useMemo(() => {
    const out: Item[] = [];
    const groups = new Map<string, Extract<Item, { kind: 'group' }>>();
    for (const f of ls.fields) {
      if (f.group && f.type === 'toggle') {
        const g = groups.get(f.group);
        if (g) g.fields.push(f);
        else { const ng = { kind: 'group' as const, name: f.group, fields: [f] }; groups.set(f.group, ng); out.push(ng); }
      } else out.push({ kind: 'field', field: f });
    }
    return out;
  }, [ls.fields]);

  const val = (f: FormatField) => values[f.key] ?? f.default;
  const change = (key: string, v: FormatValue) => {
    if (!access.editable) return;
    if (ls.mode === 'config') {
      const plan = planLiveApply(ls, state, eventCount, current, { ...current, [key]: v });
      if (plan.kind === 'format') onPatchFormat(plan.patch);
      return;
    }
    setDraft((d) => ({ ...d, [key]: v }));
  };
  const apply = () => {
    const plan = planLiveApply(ls, state, eventCount, current, draft);
    if (plan.kind === 'format') { onPatchFormat(plan.patch); onApplied?.('Match rules saved'); }
    else if (plan.kind === 'event') { dispatch(plan.action); onApplied?.('New rules apply from the next ball'); }
  };
  const resetDraft = () => setDraft((d) => ({ ...d, ...Object.fromEntries(ls.fields.map((f) => [f.key, ls.defaults?.[f.key] ?? f.default])) }));

  return (
    <View style={st.card}>
      <View style={st.head}>
        <Text style={textStyles.h3}>{ls.title}</Text>
        <View style={[st.pill, custom > 0 && st.pillCustom]}>
          <Text style={[st.pillText, custom > 0 && st.pillTextCustom]}>{custom > 0 ? `${custom} custom` : 'Standard'}</Text>
        </View>
      </View>
      {ls.hint ? <Text style={textStyles.muted}>{ls.hint}</Text> : null}
      {access.note ? <Text style={st.note}>🔒 {access.note}</Text> : null}

      {items.map((it) => {
        if (it.kind === 'group') {
          return (
            <View key={`g:${it.name}`} style={{ gap: theme.spacing(1) }}>
              <Text style={st.section}>{it.name}</Text>
              <View style={st.chips}>
                {it.fields.map((f) => {
                  const on = val(f) === true;
                  return <SelectChip key={f.key} label={f.label} active={on} disabled={!access.editable} onPress={() => change(f.key, !on)} />;
                })}
              </View>
            </View>
          );
        }
        const f = it.field;
        if (f.type === 'number' && f.step) {
          const v = Number(val(f));
          const min = f.min ?? 0;
          const max = f.max ?? 999;
          return (
            <View key={f.key} style={{ gap: theme.spacing(1) }}>
              <Text style={st.section}>{f.label}</Text>
              <View style={st.stepperRow}>
                <SelectChip label={`−${f.step}`} active={false} disabled={!access.editable} onPress={() => change(f.key, Math.max(min, v - f.step!))} />
                <Text style={st.stepperVal}>{v}{f.hint ? <Text style={textStyles.muted}> {f.hint}</Text> : null}</Text>
                <SelectChip label={`+${f.step}`} active={false} disabled={!access.editable} onPress={() => change(f.key, Math.min(max, v + f.step!))} />
              </View>
            </View>
          );
        }
        return <FormatFieldEditor key={f.key} field={f} value={val(f)} disabled={!access.editable} onChange={(v) => change(f.key, v)} />;
      })}

      {ls.mode === 'event' && access.editable && (
        <View style={st.row}>
          <Button label="Reset to standard" variant="ghost" style={{ flex: 1 }} onPress={resetDraft} />
          <Button label={before ? 'Apply' : 'Apply from next ball'} style={{ flex: 1 }} disabled={!dirty} onPress={apply} />
        </View>
      )}
      {ls.mode === 'event' && access.editable && (
        <Text style={textStyles.muted}>
          {before ? 'No balls yet — these become the match’s rules.' : 'Balls already bowled keep the rules they were bowled under.'}
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), gap: theme.spacing(2), ...theme.shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  pill: { borderRadius: 999, paddingHorizontal: theme.spacing(2), paddingVertical: 2, backgroundColor: theme.colors.surfaceAlt },
  pillCustom: { backgroundColor: theme.colors.accent + '22' },
  pillText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pillTextCustom: { color: theme.colors.accent },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  section: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: theme.spacing(2), marginBottom: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  stepperVal: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', minWidth: 96, textAlign: 'center' },
  row: { flexDirection: 'row', gap: theme.spacing(3), marginTop: theme.spacing(2) },
});
