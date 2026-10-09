/** 🔔 next to a Follow control (CricHeroes parity #23). Shown only while
 *  following; tapping opens the "Which alerts?" sheet for that follow.
 *  🔔 = every alert on · 🔔 + dot = some off · 🔕 = all off. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { useFollow } from '../data/hooks';
import { bellState } from '../data/followPrefs';
import type { FollowType } from '../data/followStore';
import { FollowAlertsSheet } from './FollowAlertsSheet';

export function FollowBell({ type, id, name, style }: { type: FollowType; id: string; name: string; style?: StyleProp<ViewStyle> }) {
  const { profile } = useAuth();
  const { isFollowing, prefsOf } = useFollow(profile?.id);
  const [open, setOpen] = useState(false);
  if (!isFollowing(type, id)) return null;
  const state = bellState(type, prefsOf(type, id));
  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Alert settings for ${name}`}
        accessibilityHint={state === 'all' ? 'All alerts on' : state === 'none' ? 'All alerts off' : 'Some alerts off'}
        onPress={() => setOpen(true)}
        style={[st.bell, style]}
        activeOpacity={0.8}
      >
        <Text style={st.glyph}>{state === 'none' ? '🔕' : '🔔'}</Text>
        {state === 'some' && <View style={st.dot} />}
      </TouchableOpacity>
      {open && <FollowAlertsSheet visible={open} type={type} id={id} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

const st = StyleSheet.create({
  bell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
  glyph: { fontSize: 18 },
  dot: { position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.primary, borderWidth: 1.5, borderColor: theme.colors.surface },
});
