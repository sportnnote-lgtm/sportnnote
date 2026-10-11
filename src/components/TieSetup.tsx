/** SD-48 — pick how a team tie is played: a federation preset (Swaythling,
 *  Thomas Cup, Davis Cup, 4 chess boards…) or a custom list of rubbers, what
 *  happens once it's decided (stop / play dead rubbers), and — for ABC v XYZ
 *  formats — which team takes the ABC letters (the ITTF draw). Used by "New
 *  series / tie" and by fixture generation ("each fixture is a team tie"). */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, SelectChip, textStyles } from './ui';
import {
  tiePresetsFor, specFromPreset, customSpec, rubberLabel,
  type TieSpec, type RubberKind, type DeadRubbers,
} from '../data/teamTie';
import type { SportId } from '../core/types';

const KIND_LABEL: Record<RubberKind, string> = { S: 'Singles', D: 'Doubles', XD: 'Mixed' };

export function TieSetup({ sport, value, onChange, teamAName, teamBName, showDraw = true }: {
  sport: SportId;
  value: TieSpec | null;
  onChange: (spec: TieSpec) => void;
  /** names for the ABC / XYZ draw chips (absent in fixture generation: home = ABC) */
  teamAName?: string;
  teamBName?: string;
  showDraw?: boolean;
}) {
  const presets = useMemo(() => tiePresetsFor(sport), [sport]);
  const chess = sport === 'chess';
  const [custom, setCustom] = useState<RubberKind[]>(chess ? ['S', 'S', 'S', 'S'] : ['S', 'S', 'D']);
  // Pick the sport's first preset when nothing is chosen yet.
  useEffect(() => {
    if (!value && presets[0]) onChange(specFromPreset(presets[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);
  const isCustom = value?.preset === 'custom';
  const pickPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (p) onChange(specFromPreset(p, value?.abc ?? 'home'));
  };
  const pickCustom = (kinds: RubberKind[]) => {
    setCustom(kinds);
    onChange(customSpec(sport, kinds, value?.dead ?? 'stop'));
  };
  const hasLetters = !!value?.pos && !value.boards && /^[A-Z]$/.test(value.pos.p[0] ?? '');

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel hint="Each rubber is a normal match, scored on its own">How the tie is played</FieldLabel>
      <View style={st.chips}>
        {presets.map((p) => <SelectChip key={p.id} label={p.label} active={value?.preset === p.id} onPress={() => pickPreset(p.id)} />)}
        <SelectChip label={chess ? '✏️ Custom boards' : '✏️ Custom rubbers'} active={isCustom} onPress={() => pickCustom(custom)} />
      </View>
      {value && !isCustom ? <Text style={textStyles.muted}>{presets.find((p) => p.id === value.preset)?.note}</Text> : null}

      {isCustom && (
        <View style={st.box}>
          {custom.map((k, i) => (
            <View key={i} style={st.row}>
              <Text style={st.no}>{i + 1}</Text>
              {chess ? <Text style={st.rowText}>Board {i + 1}</Text> : (
                <View style={st.chips}>
                  {(['S', 'D', 'XD'] as RubberKind[]).map((kk) => (
                    <SelectChip key={kk} label={KIND_LABEL[kk]} active={k === kk} onPress={() => pickCustom(custom.map((x, j) => (j === i ? kk : x)))} />
                  ))}
                </View>
              )}
              {i > 0 && !chess ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move rubber ${i + 1} up`} style={st.icon}
                  onPress={() => { const n = [...custom]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; pickCustom(n); }}>
                  <Text style={st.iconText}>↑</Text>
                </TouchableOpacity>
              ) : null}
              {custom.length > 1 ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove rubber ${i + 1}`} style={st.icon}
                  onPress={() => pickCustom(custom.filter((_, j) => j !== i))}>
                  <Text style={st.iconText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {custom.length < 12 && (
            <View style={st.chips}>
              {(chess ? (['S'] as RubberKind[]) : (['S', 'D', 'XD'] as RubberKind[])).map((k) => (
                <SelectChip key={k} label={chess ? '＋ Board' : `＋ ${KIND_LABEL[k]}`} active={false} onPress={() => pickCustom([...custom, k])} />
              ))}
            </View>
          )}
        </View>
      )}

      {value && (
        <Text style={st.order} numberOfLines={4}>
          Order: {value.rubbers.map((_, i) => `${i + 1}. ${rubberLabel(value, i)}`).join(' · ')}
        </Text>
      )}

      {value && !chess && (
        <>
          <FieldLabel hint={`More than half wins the tie (${Math.floor(value.rubbers.length / 2) + 1} of ${value.rubbers.length})`}>Once the tie is decided</FieldLabel>
          <View style={st.chips}>
            {([['stop', '⏹ Stop — rest not played'], ['play', '▶️ Play the dead rubbers']] as [DeadRubbers, string][]).map(([k, l]) => (
              <SelectChip key={k} label={l} active={value.dead === k} onPress={() => onChange({ ...value, dead: k })} />
            ))}
          </View>
          <Text style={textStyles.muted}>
            {value.dead === 'stop' ? 'Knockout style: rubbers after the decision are set aside as "not played".' : 'Group style: every rubber is played and counts towards rubbers / games tie-breaks.'}
          </Text>
        </>
      )}
      {value && chess && <Text style={textStyles.muted}>Every board is played (all at once); a draw is ½ each. More than half the board points wins the match.</Text>}

      {value && hasLetters && showDraw && (
        <>
          <FieldLabel hint="Decided by a draw before the tie (ITTF)">Who plays ABC?</FieldLabel>
          <View style={st.chips}>
            <SelectChip label={`${teamAName ?? 'Team A'} = ABC`} active={value.abc === 'home'} onPress={() => onChange({ ...value, abc: 'home' })} />
            <SelectChip label={`${teamBName ?? 'Team B'} = ABC`} active={value.abc === 'away'} onPress={() => onChange({ ...value, abc: 'away' })} />
            <SelectChip label="🪙 Draw it" active={false} onPress={() => onChange({ ...value, abc: Math.random() < 0.5 ? 'home' : 'away' })} />
          </View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), flexWrap: 'wrap' },
  no: { color: theme.colors.textMuted, fontWeight: '800', minWidth: 18 },
  rowText: { color: theme.colors.text, fontWeight: '700', flex: 1 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  order: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
});
