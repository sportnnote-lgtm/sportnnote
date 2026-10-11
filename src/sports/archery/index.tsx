/**
 * Archery plugin (SD-95, World Archery rules). Like athletics, swimming,
 * weightlifting and shooting, a meet is a programme of EVENTS — Recurve 70 m
 * U21 Men, Compound 50 m Women … — each a ranking round on the results engine
 * (data/results/archery.ts) and, optionally, a seeded match-play bracket with a
 * bronze medal match. The plugin registers the sport and its meet settings;
 * the match-scoring members are inert placeholders so the generic match
 * screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface ArcheryMatchState { ended: boolean }

const ScoringControls: SportPlugin<ArcheryMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🏹 Archery runs as events</Text>
    <Text style={textStyles.muted}>Set up each event from the tournament’s Archery page: add the archers, enter each end of the ranking round, then shoot the match-play bracket.</Text>
  </View>
);

export const archeryPlugin: SportPlugin<ArcheryMatchState> = {
  id: 'archery',
  name: 'Archery',
  icon: '🏹',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Archery event', detailLine: 'Scores are entered on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share (archers out in the same match-play round share a place)',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
      ],
    },
  ],
};
