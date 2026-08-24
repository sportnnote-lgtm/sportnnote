/** Venue input for scheduling — the free-text ground/court name plus an optional
 *  Maps link, and a row of "reuse" chips for grounds already used elsewhere so an
 *  organizer names them consistently (which is what lets clash-detection tell two
 *  games are at the same place). Shared by the Schedule and Reschedule screens. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, TextField, SelectChip, textStyles } from './ui';

export function VenueField({
  venue,
  onVenue,
  venueUrl,
  onVenueUrl,
  knownVenues,
}: {
  venue: string;
  onVenue: (v: string) => void;
  venueUrl: string;
  onVenueUrl: (v: string) => void;
  /** grounds already used elsewhere — offered as one-tap chips */
  knownVenues: string[];
}) {
  const current = venue.trim().toLowerCase();
  // Offer up to a handful of recent grounds, minus whatever's already typed.
  const suggestions = knownVenues.filter((v) => v.trim().toLowerCase() !== current).slice(0, 6);

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel>Venue / ground</FieldLabel>
      {suggestions.length > 0 && (
        <View style={st.chips}>
          {suggestions.map((v) => (
            <SelectChip key={v} label={`📍 ${v}`} active={false} onPress={() => onVenue(v)} />
          ))}
        </View>
      )}
      <TextField label="" value={venue} onChange={onVenue} placeholder="Main Ground" />
      <TextField
        label="Google Maps link (optional)"
        value={venueUrl}
        onChange={onVenueUrl}
        placeholder="maps.app.goo.gl/…"
        autoCapitalize="none"
      />
      <Text style={textStyles.muted}>
        Paste a Maps link to pin the exact spot — otherwise we search Maps by the venue name.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
