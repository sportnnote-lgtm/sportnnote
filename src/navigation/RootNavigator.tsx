import React, { Suspense, useEffect } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, getStateFromPath, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { registerForPush, setCurrentPlayerId } from '../core/notifications';
import { followStore } from '../data/followStore';
import { getFollows, savePushToken, getCaptainTeams, getMyPlayerId } from '../data/repos';
import { captainStore } from '../data/captainStore';
import { useReminderEngine } from '../data/reminders';
import '../data/devSeed'; // registers window.__sportfolioSeedDemo() in dev only
import { OnboardingOverlay } from '../components/OnboardingOverlay';
import HomeScreen from '../screens/HomeScreen';
import MatchesScreen from '../screens/MatchesScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import ProfileScreen from '../screens/ProfileScreen';
const LiveScoringScreen = lazyScreen(() => import('../screens/LiveScoringScreen'));
import AuthScreen from '../screens/AuthScreen';
import OrganizeScreen from '../screens/OrganizeScreen';
const CreateTournamentScreen = lazyScreen(() => import('../screens/CreateTournamentScreen'));
const EditTournamentScreen = lazyScreen(() => import('../screens/EditTournamentScreen'));
const TeamsScreen = lazyScreen(() => import('../screens/TeamsScreen'));
const ScheduleMatchScreen = lazyScreen(() => import('../screens/ScheduleMatchScreen'));
const CreateSeriesScreen = lazyScreen(() => import('../screens/CreateSeriesScreen'));
const SeriesScreen = lazyScreen(() => import('../screens/SeriesScreen'));
const EditMatchScreen = lazyScreen(() => import('../screens/EditMatchScreen'));
const GenerateFixturesScreen = lazyScreen(() => import('../screens/GenerateFixturesScreen'));
const TournamentTeamsScreen = lazyScreen(() => import('../screens/TournamentTeamsScreen'));
const ContingentsScreen = lazyScreen(() => import('../screens/ContingentsScreen'));
const AmericanoScreen = lazyScreen(() => import('../screens/AmericanoScreen'));
const SportSettingsScreen = lazyScreen(() => import('../screens/SportSettingsScreen'));
const OrganizerDashboardScreen = lazyScreen(() => import('../screens/OrganizerDashboardScreen'));
const NotificationPrefsScreen = lazyScreen(() => import('../screens/NotificationPrefsScreen'));
const PlayerProfileScreen = lazyScreen(() => import('../screens/PlayerProfileScreen'));
const SportProfileScreen = lazyScreen(() => import('../screens/SportProfileScreen'));
const EditProfileScreen = lazyScreen(() => import('../screens/EditProfileScreen'));
const VerificationReviewScreen = lazyScreen(() => import('../screens/VerificationReviewScreen'));
const CreateListingScreen = lazyScreen(() => import('../screens/CreateListingScreen'));
const FollowingScreen = lazyScreen(() => import('../screens/FollowingScreen'));
const MessagesScreen = lazyScreen(() => import('../screens/MessagesScreen'));
const ConversationScreen = lazyScreen(() => import('../screens/ConversationScreen'));
const GuardianLinkScreen = lazyScreen(() => import('../screens/GuardianLinkScreen'));
const MessageReportsScreen = lazyScreen(() => import('../screens/MessageReportsScreen'));
const GolfRoundScreen = lazyScreen(() => import('../screens/GolfRoundScreen'));
const GolfRoundSetupScreen = lazyScreen(() => import('../screens/GolfRoundSetupScreen'));
const StandingsScreen = lazyScreen(() => import('../screens/StandingsScreen'));
const SportHubScreen = lazyScreen(() => import('../screens/SportHubScreen'));
const TryNewSportScreen = lazyScreen(() => import('../screens/TryNewSportScreen'));
const BracketScreen = lazyScreen(() => import('../screens/BracketScreen'));
const TeamProfileScreen = lazyScreen(() => import('../screens/TeamProfileScreen'));
const SquadScreen = lazyScreen(() => import('../screens/SquadScreen'));
const ClubsScreen = lazyScreen(() => import('../screens/ClubsScreen'));
const CreateClubScreen = lazyScreen(() => import('../screens/CreateClubScreen'));
const ClubHomeScreen = lazyScreen(() => import('../screens/ClubHomeScreen'));
const ClubSportScreen = lazyScreen(() => import('../screens/ClubSportScreen'));
const JoinClubScreen = lazyScreen(() => import('../screens/JoinClubScreen'));
const ScanQRScreen = lazyScreen(() => import('../screens/ScanQRScreen'));
const DiscoverOrgsScreen = lazyScreen(() => import('../screens/DiscoverOrgsScreen'));
const JoinTeamScreen = lazyScreen(() => import('../screens/JoinTeamScreen'));
const TournamentProfileScreen = lazyScreen(() => import('../screens/TournamentProfileScreen'));
const OrganizationScreen = lazyScreen(() => import('../screens/OrganizationScreen'));
const CreateCommunityScreen = lazyScreen(() => import('../screens/CreateCommunityScreen'));
const NotificationsScreen = lazyScreen(() => import('../screens/NotificationsScreen'));
const LineupEditorScreen = lazyScreen(() => import('../screens/LineupEditorScreen'));
const CricketLineupScreen = lazyScreen(() => import('../screens/CricketLineupScreen'));
const CalendarScreen = lazyScreen(() => import('../screens/CalendarScreen'));
const MatchSquadScreen = lazyScreen(() => import('../screens/MatchSquadScreen'));
const SettingsScreen = lazyScreen(() => import('../screens/SettingsScreen'));
const SupportScreen = lazyScreen(() => import('../screens/SupportScreen'));
import LegalScreen from '../screens/LegalScreen';
const FeedbackScreen = lazyScreen(() => import('../screens/FeedbackScreen'));
const MatchLinkScreen = lazyScreen(() => import('../screens/MatchLinkScreen'));
const DeleteAccountScreen = lazyScreen(() => import('../screens/DeleteAccountScreen'));
import type { RootStackParamList, TabParamList } from './types';
import { trackScreen } from '../core/telemetry';
import { lazyScreen, prefetchScreens } from './lazyScreens';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Deep links: sportnnote://join/CODE or https://sportnnote.in/join/CODE open
// the Join screen with the code prefilled.
// Stack screens reachable by URL on web (/GolfRound?eventId=…). Keep in sync with
// the <Stack.Screen> list below — a screen missing here just opens Home on refresh.
const STACK_SCREENS = new Set<string>(['Americano', 'Bracket', 'Calendar', 'ClubHome', 'ClubSport', 'Clubs', 'Contingents', 'Conversation', 'CreateClub', 'CreateCommunity', 'CreateListing', 'CreateSeries', 'CreateTournament', 'CricketLineup', 'DeleteAccount', 'DiscoverOrgs', 'EditMatch', 'EditProfile', 'EditTournament', 'Feedback', 'Following', 'GenerateFixtures', 'GolfRound', 'GolfRoundSetup', 'GuardianLink', 'JoinClub', 'JoinTeam', 'Legal', 'LineupEditor', 'LiveScoring', 'MatchLink', 'MatchSquad', 'MessageReports', 'Messages', 'NotificationPrefs', 'Notifications', 'Organization', 'OrganizerDashboard', 'PlayerProfile', 'ScanQR', 'ScheduleMatch', 'Series', 'Settings', 'SportHub', 'SportProfile', 'SportSettings', 'Squad', 'Standings', 'Support', 'Team', 'Teams', 'Tournament', 'TournamentTeams', 'TryNewSport', 'VerificationReview']);

// Web deep links / refresh. React Navigation 7 only recognises screens listed in
// `config`, and a URL that resolves to NO state makes it call resetRoot(undefined),
// which crashes back to Home. So: the configured paths first; otherwise the first
// path segment is a stack screen (opened on top of Tabs, query → params); else Home.
// Screen views for analytics (route names only — never params).
const navRef = createNavigationContainerRef<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['sportnnote://', 'https://sportnnote.in'],
  config: {
    initialRouteName: 'Tabs',
    screens: {
      Tabs: { path: '', screens: { Home: '', Matches: 'Tabs/Matches', Organize: 'Tabs/Organize', Discover: 'Tabs/Discover', Profile: 'Tabs/Profile' } },
      JoinTeam: 'join/:token',
      // Short share links (core/shareText.ts).
      MatchLink: 'm/:matchId',
      Tournament: 't/:tournamentId',
      GolfRound: 'g/:eventId',
      JoinClub: 'join-club/:token',
    },
  },
  getStateFromPath: (path, options) => {
    const configured = getStateFromPath(path, options);
    if (configured) return configured;
    const [pathname, query = ''] = path.replace(/^\/+/, '').split('?');
    const name = decodeURIComponent(pathname.split('/')[0] ?? '');
    if (name === 'privacy' || name === 'terms') {
      // Signed out the stack only has Auth (+ Legal); signed in, Tabs (+ Legal).
      // Unregistered names are dropped when the navigator rehydrates this state.
      return { routes: [{ name: 'Auth' }, { name: 'Tabs' }, { name: 'Legal', params: { doc: name } }] } as ReturnType<typeof getStateFromPath>;
    }
    const params = Object.fromEntries(new URLSearchParams(query));
    if (STACK_SCREENS.has(name)) {
      return { routes: [{ name: 'Tabs' }, { name, params: Object.keys(params).length ? params : undefined }] } as ReturnType<typeof getStateFromPath>;
    }
    return { routes: [{ name: 'Tabs' }] } as ReturnType<typeof getStateFromPath>;
  },
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

const legalOpts = ({ route }: { route: { params?: { doc?: string } } }) => ({
  ...stackScreenOpts,
  title: route.params?.doc === 'terms' ? 'Terms of Use' : 'Privacy Policy',
});

export default function RootNavigator() {
  const { authed, loading, profile } = useAuth();

  // On sign-in: load existing follows into the store and register for push.
  useEffect(() => {
    if (!authed) { setCurrentPlayerId(null); return; }
    getFollows(profile?.id).then((keys) => followStore.hydrate(keys));
    getCaptainTeams(profile?.id).then((ids) => captainStore.hydrate(ids));
    // Know my own player id so notify() can tell "for me" (show locally) from "for
    // someone else" (deliver as a remote push to their device).
    getMyPlayerId(profile?.id).then((id) => setCurrentPlayerId(id));
    registerForPush().then((token) => {
      if (token) void savePushToken(token, profile?.id);
    });
  }, [authed, profile?.id]);

  // Warm the on-demand screens once the app has settled, so later taps are instant.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(prefetchScreens, 2500);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={navTheme}
      linking={linking}
      ref={navRef}
      onReady={() => trackScreen(navRef.getCurrentRoute()?.name)}
      onStateChange={() => trackScreen(navRef.getCurrentRoute()?.name)}
    >
      <Stack.Navigator
        // Lazy screens (lazyScreens.ts) show a spinner for the moment their chunk loads.
        screenLayout={({ children }) => (
          <Suspense fallback={<View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.colors.primary} /></View>}>
            {children}
          </Suspense>
        )}
      >
        {!authed ? (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Legal" component={LegalScreen} options={legalOpts} />
          </>
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
              name="EditMatch"
              component={EditMatchScreen}
              options={{ ...stackScreenOpts, title: 'Reschedule Match' }}
            />
            <Stack.Screen
              name="CreateSeries"
              component={CreateSeriesScreen}
              options={{ ...stackScreenOpts, title: 'New Series / Tie' }}
            />
            <Stack.Screen
              name="Series"
              component={SeriesScreen}
              options={{ ...stackScreenOpts, title: 'Series' }}
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
              name="Contingents"
              component={ContingentsScreen}
              options={{ ...stackScreenOpts, title: 'Contingents' }}
            />
            <Stack.Screen
              name="Americano"
              component={AmericanoScreen}
              options={{ ...stackScreenOpts, title: 'Americano' }}
            />
            <Stack.Screen
              name="SportSettings"
              component={SportSettingsScreen}
              options={{ ...stackScreenOpts, title: 'Sport settings' }}
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
            <Stack.Screen name="Legal" component={LegalScreen} options={legalOpts} />
            <Stack.Screen name="MatchLink" component={MatchLinkScreen} options={{ ...stackScreenOpts, title: 'Match' }} />
            <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ ...stackScreenOpts, title: 'Feedback' }} />
            <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ ...stackScreenOpts, title: 'Delete account' }} />
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
              name="Messages"
              component={MessagesScreen}
              options={{ ...stackScreenOpts, title: 'Messages' }}
            />
            <Stack.Screen
              name="Conversation"
              component={ConversationScreen}
              options={{ ...stackScreenOpts, title: 'Message' }}
            />
            <Stack.Screen
              name="GolfRound"
              component={GolfRoundScreen}
              options={{ ...stackScreenOpts, title: 'Golf round' }}
            />
            <Stack.Screen
              name="GolfRoundSetup"
              component={GolfRoundSetupScreen}
              options={{ ...stackScreenOpts, title: 'Golf round' }}
            />
            <Stack.Screen
              name="MessageReports"
              component={MessageReportsScreen}
              options={{ ...stackScreenOpts, title: 'Message reports' }}
            />
            <Stack.Screen
              name="GuardianLink"
              component={GuardianLinkScreen}
              options={{ ...stackScreenOpts, title: 'Parent / guardian' }}
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
              name="Clubs"
              component={ClubsScreen}
              options={{ ...stackScreenOpts, title: 'Teams' }}
            />
            <Stack.Screen
              name="CreateClub"
              component={CreateClubScreen}
              options={{ ...stackScreenOpts, title: 'Create Team' }}
            />
            <Stack.Screen
              name="ClubHome"
              component={ClubHomeScreen}
              options={{ ...stackScreenOpts, title: 'Team' }}
            />
            <Stack.Screen
              name="ClubSport"
              component={ClubSportScreen}
              options={{ ...stackScreenOpts, title: 'Sport profile' }}
            />
            <Stack.Screen
              name="JoinClub"
              component={JoinClubScreen}
              options={{ ...stackScreenOpts, title: 'Join a Team' }}
            />
            <Stack.Screen
              name="ScanQR"
              component={ScanQRScreen}
              options={{ ...stackScreenOpts, title: 'Scan QR' }}
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
              name="EditTournament"
              component={EditTournamentScreen}
              options={{ ...stackScreenOpts, title: 'Edit Tournament' }}
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
              name="DiscoverOrgs"
              component={DiscoverOrgsScreen}
              options={{ ...stackScreenOpts, title: 'Find a Community' }}
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
      {authed && (
        <OnboardingOverlay
          onChoose={(c) => {
            if (!navRef.isReady()) return;
            if (c === 'score') navRef.navigate('ScheduleMatch', undefined);
            else if (c === 'tournament') navRef.navigate('CreateTournament', undefined);
            else navRef.navigate('Tabs', { screen: 'Discover' });
          }}
        />
      )}
    </NavigationContainer>
  );
}
