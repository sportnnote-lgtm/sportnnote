import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/core/auth';
import RootNavigator from './src/navigation/RootNavigator';
import { isSupabaseConfigured } from './src/core/supabase';
import { hydrateDemo, startDemoAutosave } from './src/data/demoStore';
import { hydrateReminderPrefs } from './src/data/reminderPrefs';
import { hydrateTimeZone } from './src/core/time';

export default function App() {
  // In demo mode, wait for the persisted store to load before first render (avoids
  // a seed→saved flash), then start autosaving. Live mode skips this entirely.
  const [ready, setReady] = useState(isSupabaseConfigured);
  useEffect(() => {
    void hydrateReminderPrefs(); // user reminder timers (both demo + live)
    void hydrateTimeZone(); // viewer's display timezone (default IST)
    if (isSupabaseConfigured) return;
    let on = true;
    hydrateDemo().then(() => {
      if (!on) return;
      setReady(true);
      startDemoAutosave();
    });
    return () => { on = false; };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {ready && (
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      )}
    </SafeAreaProvider>
  );
}
