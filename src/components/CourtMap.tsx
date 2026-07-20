/** Generic positional layout for any sport. Renders a playing surface with
 *  sport-specific markings (passed as `children`) and places both teams'
 *  lineup dots on it: home attacks upward from the bottom, away downward from
 *  the top, with x mirrored — the same convention as the football pitch, so a
 *  single normalised formation template (x:0→1 left→right, y:0→own half→net)
 *  works for either side. Sports compose this into their own <Court/>. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import type { LineupSlot } from '../core/types';

function initials(slot: LineupSlot): string {
  if (slot.playerName) return slot.playerName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return slot.position;
}

function Dot({ slot, color, top, left }: { slot: LineupSlot; color: string; top: string; left: string }) {
  return (
    <View style={[styles.dotWrap, { top: top as any, left: left as any }]}>
      <View style={[styles.dot, { backgroundColor: color, borderColor: slot.playerId ? '#fff' : 'transparent' }]}>
        <Text style={styles.dotText} numberOfLines={1}>{initials(slot)}</Text>
      </View>
      {slot.playerName ? (
        <Text style={styles.name} numberOfLines={1}>{slot.playerName.split(' ')[0]}</Text>
      ) : (
        <Text style={styles.pos} numberOfLines={1}>{slot.position}</Text>
      )}
    </View>
  );
}

export interface CourtProps {
  homeLineup?: LineupSlot[];
  awayLineup?: LineupSlot[];
  homeColor?: string;
  awayColor?: string;
}

export function CourtMap({
  homeLineup = [],
  awayLineup = [],
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  surfaceColor = '#143d2b',
  aspectRatio = 0.64,
  /** fraction of the surface each team's half occupies (0.46 ≈ leaves a midline gap) */
  span = 0.46,
  children,
}: CourtProps & {
  surfaceColor?: string;
  aspectRatio?: number;
  span?: number;
  /** sport-specific lines/markings drawn behind the dots */
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.court, { aspectRatio, backgroundColor: surfaceColor }]}>
      {children}
      {homeLineup.map((s, i) => (
        <Dot key={`h${i}`} slot={s} color={homeColor} top={`${(1 - (s.y * span + 0.05)) * 100}%`} left={`${s.x * 100}%`} />
      ))}
      {awayLineup.map((s, i) => (
        <Dot key={`a${i}`} slot={s} color={awayColor} top={`${(s.y * span + 0.05) * 100}%`} left={`${(1 - s.x) * 100}%`} />
      ))}
    </View>
  );
}

/** Shared faint line colour for court markings. */
export const COURT_LINE = 'rgba(255,255,255,0.25)';

const styles = StyleSheet.create({
  court: {
    width: '100%',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  dotWrap: { position: 'absolute', width: 64, marginLeft: -32, alignItems: 'center' },
  dot: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginTop: -15,
  },
  dotText: { color: '#06120D', fontSize: 11, fontWeight: '800' },
  name: { color: '#fff', fontSize: 9, fontWeight: '600', marginTop: 1 },
  pos: { color: COURT_LINE, fontSize: 9, fontWeight: '700', marginTop: 1 },
});
