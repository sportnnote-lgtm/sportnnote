/**
 * Shooting plugin (SD-96, ISSF rules). Like athletics, swimming and
 * weightlifting, a meet is a programme of EVENTS — 10 m Air Rifle Junior Men,
 * 10 m Air Pistol Women … — each a qualification (match) on the results engine
 * (data/results/shooting.ts), and for 10 m air rifle / pistol and 50 m 3
 * positions an elimination final of the best 8. The plugin registers the sport
 * and its meet settings; the match-scoring members are inert placeholders so
 * the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface ShootingMatchState { ended: boolean }

const ScoringControls: SportPlugin<ShootingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🎯 Shooting runs as events</Text>
    <Text style={textStyles.muted}>Set up each event from the tournament’s Shooting page: add the shooters, enter each series (or shot), then run the final.</Text>
  </View>
);

export const shootingPlugin: SportPlugin<ShootingMatchState> = {
  id: 'shooting',
  name: 'Shooting',
  icon: '🎯',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Shooting event', detailLine: 'Scores are entered on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
      ],
    },
  ],
};
