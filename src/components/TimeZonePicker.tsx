/** Time zone picker (SD-150): the zones of the user's country first, every
 *  supported country's zones on "More", and a search over every IANA zone the
 *  engine knows on "Other…". Used by Settings → Region and tournament details. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, TextField, textStyles } from './ui';
import { useRegion } from '../core/region';
import { allTimeZones, zoneLabel, zoneShortName, zonesByCountry } from '../core/time';

export function TimeZonePicker({ value, onChange, noneLabel }: {
  value: string;
  onChange: (zone: string) => void;
  /** offer a "not set" chip (value '') with this label */
  noneLabel?: string;
}) {
  const region = useRegion();
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const groups = zonesByCountry();
  const mine = groups.find((g) => g.country === region.country)!;
  const listed = new Set(groups.flatMap((g) => g.zones.map((z) => z.id)));
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '_');
    if (s.length < 2) return [];
    return allTimeZones().filter((z) => z.toLowerCase().includes(s)).slice(0, 12);
  }, [q]);
  const chip = (id: string, label: string) => (
    <SelectChip key={id} label={label} active={value === id} onPress={() => onChange(id)} />
  );

  return (
    <View style={st.wrap}>
      <View style={st.chips}>
        {noneLabel ? <SelectChip label={noneLabel} active={!value} onPress={() => onChange('')} /> : null}
        {mine.zones.map((z) => chip(z.id, `${mine.flag} ${z.label}`))}
        {value && !mine.zones.some((z) => z.id === value) ? chip(value, zoneLabel(value)) : null}
      </View>
      <TouchableOpacity onPress={() => setMore((m) => !m)} accessibilityRole="button" hitSlop={6}>
        <Text style={st.link}>{more ? 'Fewer zones' : 'Other countries and zones…'}</Text>
      </TouchableOpacity>
      {more && (
        <View style={st.wrap}>
          {groups.filter((g) => g.country !== region.country).map((g) => (
            <View key={g.country} style={st.group}>
              <Text style={textStyles.muted}>{g.flag} {g.name}</Text>
              <View style={st.chips}>{g.zones.map((z) => chip(z.id, z.label))}</View>
            </View>
          ))}
          <TextField label="Search any time zone" value={q} onChange={setQ} placeholder="e.g. Riyadh, Toronto, Nairobi" autoCapitalize="none" />
          {hits.length > 0 && (
            <View style={st.chips}>
              {hits.map((z) => chip(z, listed.has(z) ? zoneLabel(z) : `${z.replace(/_/g, ' ')} (${zoneShortName(z)})`))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  group: { gap: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
});
