/** Reusable per-sport rule/format editor. Renders a sport's `formatFields`
 *  (choice / count / toggle / number) so both tournament creation and one-off
 *  match scheduling can set the same optional rules. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, TextField, textStyles } from './ui';
import { getSport } from '../sports/registry';
import type { FormatField, FormatFieldOption } from '../sports/types';
import type { SportId } from '../core/types';

export type FormatVal = number | string | boolean;

/** Default values for a field set, e.g. to seed a fresh format map. Applies the
 *  DEFAULT preset's `set{}` on top of the per-field defaults, so a fresh format
 *  actually matches the preset shown as selected (otherwise a sport whose preset
 *  default names non-default siblings — e.g. padel "Premier" ⇒ golden point —
 *  would silently seed the wrong rules). */
export const defaultsFor = (fields: FormatField[]): Record<string, FormatVal> => {
  const out: Record<string, FormatVal> = Object.fromEntries(fields.map((f) => [f.key, f.default]));
  const preset = fields.find((f) => f.type === 'preset');
  const chosen = preset?.options?.find((o) => o.value === preset.default);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};

export function FormatFieldEditor({ field, value, onChange }: { field: FormatField; value: FormatVal; onChange: (v: FormatVal) => void }) {
  if (field.type === 'choice' || field.type === 'preset') {
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>{field.label}{field.hint ? ` · ${field.hint}` : ''}</Text>
        <View style={fe.chips}>
          {(field.options ?? []).map((o) => (
            <SelectChip key={String(o.value)} label={o.label} active={value === o.value} onPress={() => onChange(o.value)} />
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'count') {
    const min = field.min ?? 1;
    const max = field.max ?? 11;
    const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>{field.label}{field.hint ? ` · ${field.hint}` : ''}</Text>
        <View style={fe.chips}>
          {nums.map((n) => (
            <SelectChip key={n} label={String(n)} active={value === n} onPress={() => onChange(n)} />
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'toggle') {
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>{field.label}{field.hint ? ` · ${field.hint}` : ''}</Text>
        <View style={fe.chips}>
          <SelectChip label="On" active={value === true} onPress={() => onChange(true)} />
          <SelectChip label="Off" active={value !== true} onPress={() => onChange(false)} />
        </View>
      </View>
    );
  }
  return (
    <TextField
      label={`${field.label}${field.hint ? ` (${field.hint})` : ''}`}
      value={String(value)}
      onChange={(t) => onChange(Number(t.replace(/[^0-9]/g, '')) || 0)}
      autoCapitalize="none"
    />
  );
}

/** The full rule card for one sport — every formatField, with current values.
 *  If the sport has a `preset` field, it leads; the granular (advanced) fields are
 *  hidden until the preset is "Custom" or the organizer taps "Customize". */
export function SportFormatEditor({
  sport, value, onChange, heading,
}: {
  sport: SportId;
  value: Record<string, FormatVal>;
  onChange: (key: string, v: FormatVal) => void;
  /** word after the sport name — "rules" (default) or "format". */
  heading?: string;
}) {
  const plugin = getSport(sport);
  const fields = plugin.formatFields ?? [];
  const [showAll, setShowAll] = useState(false);
  if (!fields.length) return null;

  const presetField = fields.find((f) => f.type === 'preset');
  const rest = fields.filter((f) => f !== presetField);
  const presetVal = presetField ? (value[presetField.key] ?? presetField.default) : 'custom';
  const isCustom = presetVal === 'custom';
  const hasAdvanced = rest.some((f) => f.advanced);
  const revealAdvanced = !presetField || isCustom || showAll;

  // Picking a preset snaps every sibling it names; each onChange composes on the
  // parent's functional setState, so the batch lands together.
  const pickPreset = (o: FormatFieldOption) => {
    onChange(presetField!.key, o.value);
    if (o.set) for (const k of Object.keys(o.set)) onChange(k, o.set[k]);
    if (o.value !== 'custom') setShowAll(false);
  };

  return (
    <View style={fe.card}>
      <Text style={textStyles.h3}>{plugin.icon} {plugin.name} {heading ?? 'rules'}</Text>

      {presetField && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.muted}>{presetField.label}{presetField.hint ? ` · ${presetField.hint}` : ''}</Text>
          <View style={fe.chips}>
            {(presetField.options ?? []).map((o) => (
              <SelectChip key={String(o.value)} label={o.label} active={presetVal === o.value} onPress={() => pickPreset(o)} />
            ))}
          </View>
        </View>
      )}

      {rest.map((field) =>
        field.advanced && !revealAdvanced ? null : (
          <FormatFieldEditor
            key={field.key}
            field={field}
            value={value[field.key] ?? field.default}
            onChange={(v) => onChange(field.key, v)}
          />
        )
      )}

      {presetField && !isCustom && hasAdvanced && (
        <Text style={fe.customize} onPress={() => setShowAll((s) => !s)}>
          {showAll ? '▴ Hide detailed options' : '⚙ Customize this format'}
        </Text>
      )}
    </View>
  );
}

const fe = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  card: {
    gap: theme.spacing(3), backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  customize: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
