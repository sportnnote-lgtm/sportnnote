/** Settings → Region (SD-150): the country (which sets every default below),
 *  the time zone, and one-by-one overrides for date order, 12/24-hour clock,
 *  week start, school-year start and units. Everything is on this phone; the
 *  time zone is also saved to the account so reminder emails use it. */
import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../core/theme';
import { Card, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { TimeZonePicker } from '../components/TimeZonePicker';
import {
  COUNTRY_ORDER, REGIONS, regionFor, regionStore, useRegion, exampleDate,
  type DateOrder, type RegionOverrideKey, type RegionPrefs, type WeekStart,
} from '../core/region';
import { formatDateTime, intlZonesWork, timeZoneStore, useUserTimeZone, zoneLabel } from '../core/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK: Record<WeekStart, string> = { 0: 'Sunday', 1: 'Monday', 6: 'Saturday' };

export default function RegionSettingsScreen() {
  const region = useRegion();
  const zone = useUserTimeZone();
  const prefs = regionStore.prefs();
  const base = regionFor(region.country);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zonesOk] = useState(intlZonesWork);
  const isOverridden = (k: RegionOverrideKey) => prefs[k] !== undefined;
  const set = <K extends RegionOverrideKey>(k: K, v: RegionPrefs[K]) =>
    regionStore.setOverride(k, v === (base as unknown as Record<string, unknown>)[k] ? undefined : v);

  const chooseCountry = (c: (typeof COUNTRY_ORDER)[number]) => {
    regionStore.setCountry(c);
    // Moving country → its main zone, unless the current zone already belongs to it.
    if (!REGIONS[c].zones.some((z) => z.id === zone)) timeZoneStore.set(REGIONS[c].timeZone);
  };

  const sample = formatDateTime(new Date().toISOString(), zone);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Region" subtitle="Country, time zone and how dates and times read" />

        <Card style={st.card}>
          <Text style={textStyles.h3}>Country</Text>
          <Text style={textStyles.muted}>Sets the defaults below. You can still change any of them.</Text>
          <View style={st.chips}>
            {COUNTRY_ORDER.map((c) => (
              <SelectChip key={c} label={`${REGIONS[c].flag} ${REGIONS[c].name}`} active={region.country === c} onPress={() => chooseCountry(c)} />
            ))}
          </View>
          {!prefs.country && <Text style={textStyles.muted}>Picked from your phone. Tap a country to keep it.</Text>}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>Time zone</Text>
          <TouchableOpacity onPress={() => setZoneOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`Time zone: ${zoneLabel(zone)}. Change`}>
            <Text style={st.value}>🕑 {zoneLabel(zone)}  <Text style={st.link}>{zoneOpen ? 'Done' : 'Change'}</Text></Text>
          </TouchableOpacity>
          <Text style={textStyles.muted}>Now: {sample}. Match times show in this zone; reminder emails use it too.</Text>
          {zoneOpen && <TimeZonePicker value={zone} onChange={(z) => timeZoneStore.set(z)} />}
          {!zonesOk && (
            <Text style={[textStyles.muted, { color: theme.colors.accent }]}>
              ⚠ This phone can't show other time zones. Times show on the phone's own clock.
            </Text>
          )}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>Dates and times</Text>
          <Row label="Typed dates" hint={`For pasted lists and imports: ${exampleDate(region.dateOrder)} = 5 March 2012`} changed={isOverridden('dateOrder')}>
            {(['DMY', 'MDY'] as DateOrder[]).map((o) => (
              <SelectChip key={o} label={o === 'DMY' ? 'Day first (DD/MM)' : 'Month first (MM/DD)'} active={region.dateOrder === o} onPress={() => set('dateOrder', o)} />
            ))}
          </Row>
          <Row label="Clock" changed={isOverridden('hour12')}>
            <SelectChip label="24-hour (16:30)" active={!region.hour12} onPress={() => set('hour12', false)} />
            <SelectChip label="12-hour (4:30 pm)" active={region.hour12} onPress={() => set('hour12', true)} />
          </Row>
          <Row label="Week starts on" changed={isOverridden('weekStart')}>
            {([0, 1, 6] as WeekStart[]).map((w) => (
              <SelectChip key={w} label={WEEK[w]} active={region.weekStart === w} onPress={() => set('weekStart', w)} />
            ))}
          </Row>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>School year and units</Text>
          <Row label="School year starts" hint={region.schoolYearLabel === 'calendar' ? 'Shown as "2026"' : 'Shown as "2026–27"'} changed={isOverridden('schoolYearStartMonth')}>
            {[1, 4, 8, 9].map((m) => (
              <SelectChip key={m} label={MONTHS[m - 1]} active={region.schoolYearStartMonth === m} onPress={() => set('schoolYearStartMonth', m)} />
            ))}
          </Row>
          <Row label="Units" hint="Results are always stored in metres and kilograms." changed={isOverridden('units')}>
            <SelectChip label="Metric" active={region.units === 'metric'} onPress={() => set('units', 'metric')} />
            <SelectChip label="US (feet, miles)" active={region.units === 'us'} onPress={() => set('units', 'us')} />
          </Row>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, hint, changed, children }: { label: string; hint?: string; changed?: boolean; children: React.ReactNode }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}{changed ? <Text style={st.changed}>  · changed</Text> : null}</Text>
      {hint ? <Text style={textStyles.muted}>{hint}</Text> : null}
      <View style={st.chips}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(8) },
  card: { gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { gap: theme.spacing(1.5) },
  rowLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  changed: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  value: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
