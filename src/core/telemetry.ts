/**
 * First-party analytics + crash reporting (migration 0029).
 *
 * The core KPI events (matches, tournaments, golf rounds, messages, sign-ups)
 * are recorded by database triggers, so the app only sends what the server
 * can't see: app opens, screen views, and errors.
 *
 * Privacy: no names/phones/emails/free text — only allow-listed event names
 * and short scalar props (the server re-filters both). The user is identified
 * by their pseudonymous profile id, stamped server-side from the session.
 *
 * Reliability: events queue in memory and flush in batches (every 15 s, at 20
 * events, or when the app goes to the background). Errors are sent at once,
 * and also parked in storage first so a fatal crash is reported on next launch.
 * Telemetry never throws into the app. Demo mode sends nothing.
 */
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { isSupabaseConfigured, supabase } from './supabase';

type Props = Record<string, string | number | boolean>;
type Queued = { name: string; at: string; props: Props };
export type ClientEvent = 'app_open' | 'screen_view' | 'share_link' | 'install_prompt' | 'sign_in' | 'sign_out' | 'onboarding_step' | 'feedback_sent';

const ANON_KEY = 'sn.telemetry.anonId';
const PENDING_ERRORS_KEY = 'sn.telemetry.pendingErrors';
const MAX_ERRORS_PER_SESSION = 20;

const enabled = isSupabaseConfigured && !!supabase;
const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'web';

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** "1.0.0" plus the OTA update id when running a published update. */
function appVersion(): string {
  const base = Constants.expoConfig?.version ?? '0';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as { updateId?: string | null; isEmbeddedLaunch?: boolean };
    if (Updates.updateId && !Updates.isEmbeddedLaunch) return `${base}+${Updates.updateId.slice(0, 8)}`;
  } catch { /* not available (web) */ }
  return base;
}

const sessionId = uuid();
const version = appVersion();
let anonId: string | null = null;
let queue: Queued[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let errorsThisSession = 0;
let currentScreen: string | undefined;
let screenTrail: string[] = [];
let started = false;

async function loadAnonId(): Promise<string> {
  if (anonId) return anonId;
  try {
    const saved = await AsyncStorage.getItem(ANON_KEY);
    if (saved) return (anonId = saved);
    anonId = uuid();
    await AsyncStorage.setItem(ANON_KEY, anonId);
  } catch {
    anonId = anonId ?? uuid();
  }
  return anonId;
}

/** Record a client event. Safe to call anywhere; never throws. */
export function track(name: ClientEvent, props: Props = {}): void {
  if (!enabled) return;
  queue.push({ name, at: new Date().toISOString(), props });
  if (queue.length >= 20) void flush();
}

/** Called by the navigator on every screen change. */
export function trackScreen(screen: string | undefined): void {
  if (!screen || screen === currentScreen) return;
  currentScreen = screen;
  screenTrail = [...screenTrail, screen].slice(-6);
  track('screen_view', { screen });
}

/** The last few screens visited (oldest first) — attached to feedback so we
 *  know where the user was. Route names only. */
export function recentScreens(): string[] {
  return screenTrail;
}

export const appVersionLabel = (): string => version;

export async function flush(): Promise<void> {
  if (!enabled || !queue.length) return;
  const batch = queue.slice(0, 50);
  queue = queue.slice(batch.length);
  try {
    const { error } = await supabase!.rpc('track_events', {
      p_events: batch, p_anon_id: await loadAnonId(), p_session_id: sessionId,
      p_platform: platform, p_app_version: version,
    });
    if (error) throw error;
  } catch {
    // Offline or server hiccup: put them back (bounded) for the next flush.
    queue = [...batch, ...queue].slice(-200);
  }
}

type ErrorReport = { message: string; stack?: string; fatal: boolean; screen?: string };

async function sendError(r: ErrorReport): Promise<boolean> {
  try {
    const { error } = await supabase!.rpc('report_client_error', {
      p_message: r.message, p_stack: r.stack ?? null, p_fatal: r.fatal, p_screen: r.screen ?? null,
      p_anon_id: await loadAnonId(), p_session_id: sessionId, p_platform: platform, p_app_version: version,
    });
    return !error;
  } catch {
    return false;
  }
}

async function parkError(r: ErrorReport): Promise<void> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(PENDING_ERRORS_KEY)) ?? '[]') as ErrorReport[];
    await AsyncStorage.setItem(PENDING_ERRORS_KEY, JSON.stringify([...saved, r].slice(-10)));
  } catch { /* ignore */ }
}

async function sendParkedErrors(): Promise<void> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(PENDING_ERRORS_KEY)) ?? '[]') as ErrorReport[];
    if (!saved.length) return;
    await AsyncStorage.removeItem(PENDING_ERRORS_KEY);
    for (const r of saved) if (!(await sendError(r))) await parkError(r);
  } catch { /* ignore */ }
}

/** Report an error (caught or uncaught). Never throws. */
export function reportError(err: unknown, opts: { fatal?: boolean } = {}): void {
  if (!enabled || errorsThisSession >= MAX_ERRORS_PER_SESSION) return;
  errorsThisSession++;
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : safeString(err));
  const report: ErrorReport = {
    message: `${e.name}: ${e.message}`.slice(0, 500),
    stack: e.stack?.slice(0, 4000),
    fatal: !!opts.fatal,
    screen: currentScreen,
  };
  // Park first: if this crash kills the app, the next launch still reports it.
  void parkError(report).then(async () => {
    if (await sendError(report)) {
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(PENDING_ERRORS_KEY)) ?? '[]') as ErrorReport[];
        const rest = saved.filter((s) => !(s.message === report.message && s.stack === report.stack));
        await AsyncStorage.setItem(PENDING_ERRORS_KEY, JSON.stringify(rest));
      } catch { /* ignore */ }
    }
  });
}

function safeString(v: unknown): string {
  try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); }
}

/** Install global error handlers, record app_open, start batching. Call once at startup. */
export function startTelemetry(): void {
  if (!enabled || started) return;
  started = true;

  // Native (and web dev): React Native's global JS error handler.
  const EU = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (EU) {
    const previous = EU.getGlobalHandler();
    EU.setGlobalHandler((e, fatal) => {
      reportError(e, { fatal: !!fatal });
      previous(e, fatal);
    });
  }
  // Unhandled promise rejections (Hermes).
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (o: object) => void } }).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id: number, reason: unknown) => reportError(reason),
  });
  // Web.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, { fatal: false }));
    window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
    window.addEventListener('pagehide', () => { void flush(); });
  }

  AppState.addEventListener('change', (s) => { if (s !== 'active') void flush(); });
  timer = setInterval(() => { void flush(); }, 15_000);

  track('app_open', { standalone: isStandaloneWeb() });
  void sendParkedErrors();
}

/** Web only: launched from the home-screen icon (installed) vs a browser tab. */
function isStandaloneWeb(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** For tests. */
export function stopTelemetry(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
