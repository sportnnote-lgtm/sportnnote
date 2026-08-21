import React, { useEffect } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { registerForPush } from '../core/notifications';
import { followStore } from '../data/followStore';
import { getFollows, savePushToken, getCaptainTeams } from '../data/repos';
import { captainStore } from '../data/captainStore';
import { useReminderEngine } from '../data/reminders';
import '../data/devSeed'; // registers window.__sportfolioSeedDemo() in dev only
import HomeScreen from '../screens/HomeScreen';
import MatchesScreen from '../screens/MatchesScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LiveScoringScreen from '../screens/LiveScoringScreen';
import AuthScreen from '../screens/AuthScreen';
import OrganizeScreen from '../screens/OrganizeScreen';
import CreateTournamentScreen from '../screens/CreateTournamentScreen';
import TeamsScreen from '../screens/TeamsScreen';
import ScheduleMatchScreen from '../screens/ScheduleMatchScreen';
import GenerateFixturesScreen from '../screens/GenerateFixturesScreen';
import TournamentTeamsScreen from '../screens/TournamentTeamsScreen';
import OrganizerDashboardScreen from '../screens/OrganizerDashboardScreen';
import NotificationPrefsScreen from '../screens/NotificationPrefsScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';
import SportProfileScreen from '../screens/SportProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import VerificationReviewScreen from '../screens/VerificationReviewScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import FollowingScreen from '../screens/FollowingScreen';
import StandingsScreen from '../screens/StandingsScreen';
import SportHubScreen from '../screens/SportHubScreen';
import TryNewSportScreen from '../screens/TryNewSportScreen';
import BracketScreen from '../screens/BracketScreen';
import TeamProfileScreen from '../screens/TeamProfileScreen';
import SquadScreen from '../screens/SquadScreen';
import JoinTeamScreen from '../screens/JoinTeamScreen';
import TournamentProfileScreen from '../screens/TournamentProfileScreen';
import OrganizationScreen from '../screens/OrganizationScreen';
import CreateCommunityScreen from '../screens/CreateCommunityScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import LineupEditorScreen from '../screens/LineupEditorScreen';
import CricketLineupScreen from '../screens/CricketLineupScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MatchSquadScreen from '../screens/MatchSquadScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SupportScreen from '../screens/SupportScreen';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Deep links: sportnnote://join/CODE or https://sportnnote.in/join/CODE open
// the Join screen with the code prefilled.
const linking = {
  prefixes: ['sportnnote://', 'https://sportnnote.in'],
  config: { screens: { JoinTeam: 'join/:token' } },
};

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.primary,
  },
};

const icon = (emoji: string) => ({ color }: { color: string }) =>
  <Text style={{ fontSize: 20, color }}>{emoji}</Text>;

function Tabs() {
  // Anyone can host a game or tournament at any time, so Organize is available
  // to every user — it's an entry point, not a privilege.
  useReminderEngine(); // host "no scorer" + scorer prep reminders
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: icon('🏠') }} />
      <Tab.Screen name="Matches" component={MatchesScreen} options={{ tabBarIcon: icon('📅') }} />
      <Tab.Screen name="Organize" component={OrganizeScreen} options={{ tabBarIcon: icon('🎛️') }} />
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ tabBarIcon: icon('🔍') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: icon('👤') }} />
    </Tab.Navigator>
  );
}

const stackScreenOpts = {
  headerShown: true,
  headerStyle: { backgroundColor: theme.colors.surface },
  headerTintColor: theme.colors.text,
} as const;

export default function RootNavigator() {
  const { authed, loading, profile } = useAuth();

  // On sign-in: load existing follows into the store and register for push.
  useEffect(() => {
    if (!authed) return;
    getFollows(profile?.id).then((keys) => followStore.hydrate(keys));
    getCaptainTeams(profile?.id).then((ids) => captainStore.hydrate(ids));
    registerForPush().then((token) => {
      if (token) void savePushToken(token, profile?.id);
    });
  }, [authed, profile?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator>
        {!authed ? (
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="LiveScoring"
              component={LiveScoringScreen}
              options={{ ...stackScreenOpts, title: 'Live Scoring' }}
            />
            <Stack.Screen
              name="CreateTournament"
              component={CreateTournamentScreen}
              options={{ ...stackScreenOpts, title: 'New Tournament' }}
            />
            <Stack.Screen
              name="Teams"
              component={TeamsScreen}
              options={{ ...stackScreenOpts, title: 'Teams' }}
            />
            <Stack.Screen
              name="ScheduleMatch"
              component={ScheduleMatchScreen}
              options={{ ...stackScreenOpts, title: 'Schedule Match' }}
            />
            <Stack.Screen
              name="GenerateFixtures"
              component={GenerateFixturesScreen}
              options={{ ...stackScreenOpts, title: 'Auto-generate Fixtures' }}
            />
            <Stack.Screen
              name="TournamentTeams"
              component={TournamentTeamsScreen}
              options={{ ...stackScreenOpts, title: 'Participating Teams' }}
            />
            <Stack.Screen
              name="OrganizerDashboard"
              component={OrganizerDashboardScreen}
              options={{ ...stackScreenOpts, title: 'Organizer Dashboard' }}
            />
            <Stack.Screen
              name="NotificationPrefs"
              component={NotificationPrefsScreen}
              options={{ ...stackScreenOpts, title: 'Match reminders' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ ...stackScreenOpts, title: 'Settings' }}
            />
            <Stack.Screen
              name="Support"
              component={SupportScreen}
              options={{ ...stackScreenOpts, title: 'Help & Support' }}
            />
            <Stack.Screen
              name="PlayerProfile"
              component={PlayerProfileScreen}
              options={{ ...stackScreenOpts, title: 'Player' }}
            />
            <Stack.Screen
              name="SportProfile"
              component={SportProfileScreen}
              options={{ ...stackScreenOpts, title: 'Sport' }}
            />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ ...stackScreenOpts, title: 'Edit Profile' }}
            />
            <Stack.Screen
              name="VerificationReview"
              component={VerificationReviewScreen}
              options={{ ...stackScreenOpts, title: 'Verification Review' }}
            />
            <Stack.Screen
              name="CreateListing"
              component={CreateListingScreen}
              options={{ ...stackScreenOpts, title: 'New Listing' }}
            />
            <Stack.Screen
              name="Following"
              component={FollowingScreen}
              options={{ ...stackScreenOpts, title: 'Following' }}
            />
            <Stack.Screen
              name="Standings"
              component={StandingsScreen}
              options={{ ...stackScreenOpts, title: 'Standings' }}
            />
            <Stack.Screen
              name="SportHub"
              component={SportHubScreen}
              options={{ ...stackScreenOpts, title: 'Sport' }}
            />
            <Stack.Screen
              name="TryNewSport"
              component={TryNewSportScreen}
              options={{ ...stackScreenOpts, title: 'Try a New Sport' }}
            />
            <Stack.Screen
              name="Bracket"
              component={BracketScreen}
              options={{ ...stackScreenOpts, title: 'Bracket' }}
            />
            <Stack.Screen
              name="Team"
              component={TeamProfileScreen}
              options={{ ...stackScreenOpts, title: 'Team' }}
            />
            <Stack.Screen
              name="Squad"
              component={SquadScreen}
              options={{ ...stackScreenOpts, title: 'Squad' }}
            />
            <Stack.Screen
              name="JoinTeam"
              component={JoinTeamScreen}
              options={{ ...stackScreenOpts, title: 'Join a Team' }}
            />
            <Stack.Screen
              name="Tournament"
              component={TournamentProfileScreen}
              options={{ ...stackScreenOpts, title: 'Tournament' }}
            />
            <Stack.Screen
              name="Organization"
              component={OrganizationScreen}
              options={{ ...stackScreenOpts, title: 'Community' }}
            />
            <Stack.Screen
              name="CreateCommunity"
              component={CreateCommunityScreen}
              options={{ ...stackScreenOpts, title: 'New Community' }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ ...stackScreenOpts, title: 'Notifications' }}
            />
            <Stack.Screen
              name="LineupEditor"
              component={LineupEditorScreen}
              options={{ ...stackScreenOpts, title: 'Lineup' }}
            />
            <Stack.Screen
              name="CricketLineup"
              component={CricketLineupScreen}
              options={{ ...stackScreenOpts, title: 'Batting order' }}
            />
            <Stack.Screen
              name="MatchSquad"
              component={MatchSquadScreen}
              options={{ ...stackScreenOpts, title: 'Matchday Squad' }}
            />
            <Stack.Screen
              name="Calendar"
              component={CalendarScreen}
              options={{ ...stackScreenOpts, title: 'Calendar' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
