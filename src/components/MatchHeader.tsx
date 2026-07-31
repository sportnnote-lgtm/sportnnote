/**
 * Match-identity header — who's playing, framed for broadcast. The sport + a
 * LIVE/FINAL/UPCOMING status chip on top, then both full team names in their
 * colours over colour bars either side of a VS. Renders header content only (no
 * card wrapper) so callers can place it inside their own surface. The score lives
 * on the scoreboard above the tabs; this answers who, not what the score is.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { LogoPicker } from './LogoPicker';

export function MatchHeader({
  sportIcon, sportName, statusLabel, matchLive, complete,
  homeName, awayName, homeColor, awayColor,
  hasMatch, logoUrl, canManage, onPickLogo,
}: {
  sportIcon: string;
  sportName: string;
  statusLabel: string;
  /** match in progress → red chip + dot */
  matchLive: boolean;
  complete: boolean;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  hasMatch?: boolean;
  logoUrl?: string;
  canManage?: boolean;
  onPickLogo?: (uri: string) => void;
}) {
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={st.topRow}>
        {hasMatch && (
          <LogoPicker
            logoUrl={logoUrl}
            canManage={!!canManage}
            onPick={(uri) => onPickLogo?.(uri)}
            size={36}
            placeholder={sportIcon}
            label="Add"
          />
        )}
        <Text style={st.sport} numberOfLines={1}>{sportIcon} {sportName}</Text>
        <View style={[st.status, complete ? st.statusFinal : matchLive ? st.statusLive : st.statusSoon]}>
          {matchLive ? <View style={st.liveDot} /> : null}
          <Text style={[st.statusText, matchLive && { color: '#fff' }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={st.teams}>
        <View style={st.team}>
          <View style={[st.bar, { backgroundColor: homeColor ?? theme.colors.home }]} />
          <Text style={[st.teamName, { color: homeColor ?? theme.colors.home }]} numberOfLines={2}>{homeName}</Text>
        </View>
        <Text style={st.vs}>VS</Text>
        <View style={st.team}>
          <View style={[st.bar, { backgroundColor: awayColor ?? theme.colors.away }]} />
          <Text style={[st.teamName, { color: awayColor ?? theme.colors.away }]} numberOfLines={2}>{awayName}</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  sport: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill },
  statusLive: { backgroundColor: theme.colors.danger },
  statusFinal: { backgroundColor: theme.colors.surfaceAlt },
  statusSoon: { backgroundColor: theme.colors.surfaceAlt },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  statusText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 1 },
  teams: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(3) },
  team: { flex: 1, alignItems: 'center', gap: theme.spacing(2) },
  bar: { width: 40, height: 4, borderRadius: 2 },
  teamName: { fontSize: theme.font.h3, fontWeight: '900', textAlign: 'center' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', marginHorizontal: theme.spacing(2) },
});
