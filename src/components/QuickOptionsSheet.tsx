/** Quick options (parity #13) — the scorer's in-play menu: a bottom sheet of
 *  2-column tiles (break, squad, scorer, scorecard, settings) plus any tiles the
 *  sport adds (cricket: Change keeper). A `Modal` sheet like ContextSwitcher.
 *  Each tile either acts and closes, or opens a small panel inside the sheet. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip, TextField, textStyles } from './ui';
import { BREAK_KINDS, BREAK_LABELS, type BreakKind } from '../data/matchHousekeeping';

export interface QuickOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  homeName: string;
  awayName: string;
  /** ⏸ Match break — kind + optional note (Other) */
  onBreak?: (kind: BreakKind, note?: string) => void;
  /** 👥 Change squad — which side */
  onSquad?: (side: 'home' | 'away') => void;
  /** 🎙 Change scorer — goes to the Info tab */
  onScorer?: () => void;
  /** 📋 Full scorecard — goes to the first live view */
  onScorecard?: () => void;
  /** ⚙️ Match settings (#14) — the sport's LiveSettingsCard, shown inside the
   *  sheet. No tile when the sport has no live settings. */
  settingsPanel?: React.ReactNode;
  /** the sport's own tiles (SportPlugin.QuickOptions), already bound to state */
  pluginTiles?: React.ReactNode;
}

type Panel = null | 'break' | 'squad' | 'settings';

export function QuickOptionsSheet({ visible, onClose, homeName, awayName, onBreak, onSquad, onScorer, onScorecard, settingsPanel, pluginTiles }: QuickOptionsSheetProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [kind, setKind] = useState<BreakKind | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { if (!visible) { setPanel(null); setKind(null); setNote(''); } }, [visible]);

  const startBreak = () => {
    if (!kind || !onBreak) return;
    if (kind === 'other' && !note.trim()) return;
    onBreak(kind, kind === 'other' ? note.trim() : undefined);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close quick options">
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ gap: theme.spacing(3) }} keyboardShouldPersistTaps="handled">
            <View style={st.head}>
              <Text style={st.title}>{panel === 'break' ? '⏸ Match break' : panel === 'squad' ? '👥 Change squad' : panel === 'settings' ? '⚙️ Match settings' : 'Quick options'}</Text>
              <Text style={st.close} accessibilityRole="button" onPress={panel ? () => setPanel(null) : onClose}>{panel ? '‹ Back' : '✕'}</Text>
            </View>

            {panel === null && (
              <>
                <View style={st.grid}>
                  {onBreak && <Tile icon="⏸" label="Match break" hint="Drinks, rain, stumps…" onPress={() => setPanel('break')} />}
                  {onSquad && <Tile icon="👥" label="Change squad" hint="Add or bench players" onPress={() => setPanel('squad')} />}
                  {onScorer && <Tile icon="🎙" label="Change scorer" hint="Scorers & officials" onPress={() => { onClose(); onScorer(); }} />}
                  {onScorecard && <Tile icon="📋" label="Full scorecard" hint="See the whole card" onPress={() => { onClose(); onScorecard(); }} />}
                  {settingsPanel ? <Tile icon="⚙️" label="Match settings" hint="This match only" onPress={() => setPanel('settings')} /> : null}
                </View>
                {pluginTiles}
              </>
            )}

            {panel === 'break' && (
              <View style={{ gap: theme.spacing(3) }}>
                <Text style={textStyles.muted}>Play pauses for everyone watching. Nothing is added to the score, so undo stays clean.</Text>
                <View style={st.chips}>
                  {BREAK_KINDS.map((k) => <SelectChip key={k} label={BREAK_LABELS[k]} active={kind === k} onPress={() => setKind(k)} />)}
                </View>
                {kind === 'other' && <TextField label="What's the break?" value={note} onChange={setNote} placeholder="e.g. Power cut" />}
                <Button label="⏸ Start break" disabled={!kind || (kind === 'other' && !note.trim())} onPress={startBreak} />
              </View>
            )}

            {panel === 'settings' && settingsPanel}

            {panel === 'squad' && onSquad && (
              <View style={st.grid}>
                <Tile icon="🏠" label={homeName} hint="Edit squad" onPress={() => { onClose(); onSquad('home'); }} />
                <Tile icon="✈️" label={awayName} hint="Edit squad" onPress={() => { onClose(); onSquad('away'); }} />
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One 2-column tile. Exported so a sport's QuickOptions can match the look. */
export function Tile({ icon, label, hint, onPress, active }: { icon: string; label: string; hint?: string; onPress: () => void; active?: boolean }) {
  return (
    <TouchableOpacity style={[st.tile, active && st.tileActive]} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Text style={st.tileIcon}>{icon}</Text>
      <Text style={st.tileLabel} numberOfLines={1}>{label}</Text>
      {hint ? <Text style={st.tileHint} numberOfLines={1}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), maxHeight: '80%', width: '100%', maxWidth: 640, alignSelf: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  close: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800', padding: theme.spacing(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: {
    flexBasis: '48%', flexGrow: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: 2,
  },
  tileActive: { borderColor: theme.colors.primary },
  tileIcon: { fontSize: 22 },
  tileLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  tileHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
