/**
 * Supabase client — the backend for auth, data, storage and realtime live scores.
 *
 * Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in a .env
 * file (see .env.example). Until then the app still runs in "demo" mode — the
 * live-scoring screen works fully offline against local state, so you can
 * explore the architecture before wiring a real project.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { clearReadCache, writeAwareFetch } from '../data/readCache';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      // Perf F-19: every write empties the short-lived read cache (data/readCache.ts),
      // so the user's own changes are always read back fresh.
      global: { fetch: writeAwareFetch((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), clearReadCache) },
    })
  : null;
