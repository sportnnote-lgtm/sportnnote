/** Football pitch map: both teams' formations on one vertical pitch. Home
 *  attacks upward from the bottom, away downward from the top. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import type { LineupSlot } from '../../core/types';

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

export function Pitch({
  homeLineup = [],
  awayLineup = [],
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
}: {
  homeLineup?: LineupSlot[];
  awayLineup?: LineupSlot[];
  homeColor?: string;
  awayColor?: string;
}) {
  return (
    <View style={styles.pitch}>
      {/* markings */}
      <View style={styles.halfway} />
      <View style={styles.centre} />
      <View style={[styles.box, styles.boxTop]} />
      <View style={[styles.box, styles.boxBottom]} />

      {homeLineup.map((s, i) => (
        <Dot key={`h${i}`} slot={s} color={homeColor} top={`${(1 - (s.y * 0.46 + 0.05)) * 100}%`} left={`${s.x * 100}%`} />
      ))}
      {awayLineup.map((s, i) => (
        <Dot key={`a${i}`} slot={s} color={awayColor} top={`${(s.y * 0.46 + 0.05) * 100}%`} left={`${(1 - s.x) * 100}%`} />
      ))}
    </View>
  );
}

const line = 'rgba(255,255,255,0.25)';
const styles = StyleSheet.create({
  pitch: {
    width: '100%',
    aspectRatio: 0.64,
    backgroundColor: '#143d2b',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  halfway: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: line },
  centre: {
    position: 'absolute', top: '50%', left: '50%', width: 64, height: 64, borderRadius: 32,
    borderWidth: 1, borderColor: line, marginLeft: -32, marginTop: -32,
  },
  box: { position: 'absolute', left: '25%', width: '50%', height: '14%', borderWidth: 1, borderColor: line },
  boxTop: { top: 0, borderTopWidth: 0 },
  boxBottom: { bottom: 0, borderBottomWidth: 0 },
  dotWrap: { position: 'absolute', width: 64, marginLeft: -32, alignItems: 'center' },
  dot: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginTop: -15,
  },
  dotText: { color: '#06120D', fontSize: 11, fontWeight: '800' },
  name: { color: '#fff', fontSize: 9, fontWeight: '600', marginTop: 1 },
  pos: { color: line, fontSize: 9, fontWeight: '700', marginTop: 1 },
});
