/**
 * Swimming plugin (SD-94, World Aquatics Swimming Rules). Like athletics, a
 * swim meet is a programme of EVENTS (50 m freestyle U12 Girls, 4 × 50 m
 * medley relay U14 Boys …), each swum as a straight / timed final or heats →
 * (semi-finals →) final on the results engine (data/results/swimming.ts,
 * the shared measured-event setup, results and hub screens). The plugin
 * registers the sport and its meet settings; the match-scoring members are
 * inert placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface SwimmingMatchState { ended: boolean }

const ScoringControls: SportPlugin<SwimmingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🏊 Swimming runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Swimming page: add the event, its swimmers and rounds, then enter times heat by heat.</Text>
  </View>
);

export const swimmingPlugin: SportPlugin<SwimmingMatchState> = {
  id: 'swimming',
  name: 'Swimming',
  icon: '🏊',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Swimming event', detailLine: 'Results are entered per heat on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'course', label: 'Pool', type: 'choice', default: 'LCM', onCreate: true,
      hint: 'records and personal bests are kept separately for 25 m and 50 m pools',
      options: [{ value: 'LCM', label: '50 m (long course)' }, { value: 'SCM', label: '25 m (short course)' }],
    },
    {
      key: 'lanes', label: 'Lanes', type: 'choice', default: 8, onCreate: true,
      hint: 'a 10-lane pool numbers its lanes 0–9',
      options: [{ value: 6, label: '6' }, { value: 8, label: '8' }, { value: 10, label: '10' }, { value: 5, label: '5' }, { value: 4, label: '4' }],
    },
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    {
      key: 'relayFactor', label: 'Relay points', type: 'choice', default: 1,
      options: [{ value: 1, label: 'Same as individual' }, { value: 2, label: 'Double' }],
    },
    { key: 'handTimed', label: 'Manual timing', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches, no touchpads: times to 1/100 from the lane’s watches (SW 11.3) count for meet records' },
    { key: 'splits', label: '50 m splits', type: 'toggle', default: true, advanced: true, hint: 'record the time at every 50 m (races over 50 m)' },
    { key: 'reaction', label: 'Reaction times', type: 'toggle', default: false, advanced: true, hint: 'touchpad timing reads each start' },
  ],
};
