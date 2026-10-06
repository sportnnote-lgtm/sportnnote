/**
 * Settings — one home for everything that isn't the player's sporting record.
 *
 * These controls used to live at the bottom of the Profile scroll, below all of
 * a player's stats/teams/communities, so changing a reminder or signing out
 * meant scrolling past everything. Gathering them here gives the app a single,
 * predictable Settings destination (reached from the ⚙ on the Profile header)
 * and a natural anchor for Help & support.
 */
import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { theme } from '../core/theme';
import { Card, SelectChip, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { TIME_ZONES, timeZoneStore, useUserTimeZone, zoneLabel } from '../core/time';
import { reminderPrefsStore, formatLead } from '../data/reminderPrefs';
import { onboardingStore } from '../data/onboardingStore';
import { getMyPlayerId } from '../data/repos';
import { getUnreadThreadCount } from '../data/messages';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** A tappable settings row: icon · label (+ optional value) · chevron. */
function Row({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      activeOpacity={0.7}
      onPress={onPress}
      style={st.row}
    >
      <Text style={st.rowIcon}>{icon}</Text>
      <Text style={[textStyles.body, st.rowLabel, danger && { color: theme.colors.danger }]}>{label}</Text>
      {value ? <Text style={st.rowValue} numberOfLines={1}>{value}</Text> : null}
      <Text style={st.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.groupTitle}>{title}</Text>
      <Card style={st.group}>{children}</Card>
    </View>
  );
}

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const { profile, demo, signOut } = useAuth();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id).then((id) => on && setPlayerId(id));
      getUnreadThreadCount().then((n) => on && setUnread(n));
      return () => {
        on = false;
      };
    }, [profile?.id])
  );

  // Reminder timers + timezone are read live so the summaries stay current.
  const reminders = useSyncExternalStore(reminderPrefsStore.subscribe, reminderPrefsStore.getSnapshot);
  const reminderSummary = reminders.length ? reminders.map((m) => formatLead(m).replace(' before', '')).join(' · ') : 'Off';
  const tz = useUserTimeZone();
  const [tzOpen, setTzOpen] = useState(false);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <Group title="Preferences">
          <Row icon="🔔" label="Match reminders" value={reminderSummary} onPress={() => nav.navigate('NotificationPrefs')} />
          <View style={st.divider} />
          <Row icon="🕑" label="Time zone" value={zoneLabel(tz)} onPress={() => setTzOpen((o) => !o)} />
          {tzOpen && (
            <View style={st.tzChips}>
              {TIME_ZONES.map((z) => (
                <SelectChip key={z.id} label={z.label} active={tz === z.id} onPress={() => timeZoneStore.set(z.id)} />
              ))}
            </View>
          )}
        </Group>

        <Group title="Account">
          {playerId && (
            <>
              <Row icon="✏️" label="Edit profile" onPress={() => nav.navigate('EditProfile', { playerId })} />
              <View style={st.divider} />
            </>
          )}
          <Row icon="💬" label="Messages" value={unread ? `${unread} unread` : undefined} onPress={() => nav.navigate('Messages')} />
          <View style={st.divider} />
          <Row icon="★" label="Following" onPress={() => nav.navigate('Following')} />
          <View style={st.divider} />
          <Row icon="🎟️" label="Join a team with a code" onPress={() => nav.navigate('JoinTeam')} />
          <View style={st.divider} />
          <Row icon="👪" label="Link as a parent/guardian" value="Get messages about your child" onPress={() => nav.navigate('GuardianLink')} />
        </Group>

        {isSupport(profile?.role) && (
          <Group title="Support tools">
            <Row icon="🛡️" label="Review verifications" onPress={() => nav.navigate('VerificationReview')} />
            <View style={st.divider} />
            <Row icon="🚩" label="Message reports" onPress={() => nav.navigate('MessageReports')} />
          </Group>
        )}

        <Group title="Help">
          <Row icon="💬" label="Help & support" value="Guides · contact us" onPress={() => nav.navigate('Support')} />
          <View style={st.divider} />
          <Row icon="🧭" label="Replay app tour" onPress={() => { nav.navigate('Tabs', { screen: 'Home' }); onboardingStore.request(); }} />
        </Group>

        <Text style={st.version}>SportnNote v{version}{demo ? ' · demo mode' : ''}</Text>

        {!demo && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign out" activeOpacity={0.7} onPress={signOut} style={st.signOut}>
            <Text style={st.signOutText}>Sign out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(5) },
  groupTitle: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  group: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4) },
  rowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  rowLabel: { flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small },
  chevron: { color: theme.colors.textMuted, fontSize: 20 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: theme.spacing(4) },
  tzChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), padding: theme.spacing(4), paddingTop: 0 },
  version: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center', marginTop: theme.spacing(2) },
  signOut: { alignSelf: 'center', paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(6) },
  signOutText: { color: theme.colors.danger, fontSize: theme.font.body, fontWeight: '700' },
});
