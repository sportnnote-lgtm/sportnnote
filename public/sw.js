/* SportnNote service worker.
 *  • Web push (iPhone Home Screen app / browsers): payload { title, body, url?, tag? }.
 *  • Works on poor signal at the ground:
 *      – pages: network first, else the last saved app page (opens offline). On
 *        "lie-fi" (a connection that hangs) the saved page is used after 3 s and
 *        the newer version is still saved in the background for the next open;
 *      – app code (/_expo/static/, /assets/ — hashed, never change): saved on first
 *        use, then served from the phone;
 *      – data reads (Supabase REST GETs): network first, else the last copy we saw,
 *        so a match still shows its latest score when the signal drops.
 *    Online, the newest version always wins — nobody gets stuck on an old app.
 *    Signing out sends 'clear-data' and the saved data is wiped. */
const SHELL = 'sn-shell-v1';
const API = 'sn-api-v1';
const MAX_API_ENTRIES = 300;
/** How long a page load waits for the network before opening the saved app. */
const NAV_TIMEOUT_MS = 3000;
/** Bumped by 'clear-data' so a data copy still being written can't land after sign-out. */
let apiGen = 0;

/** Save the app page AND every script/stylesheet it loads — the main bundle is
 *  requested before this worker controls the page, so it must be fetched here. */
async function saveShell(html) {
  const c = await caches.open(SHELL);
  const srcs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)="(\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(srcs.map(async (u) => {
    if (await c.match(u)) return;
    try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch (e) { /* offline */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const c = await caches.open(SHELL);
      await c.addAll(['/manifest.json', '/icon-192.png']);
      const res = await fetch('/', { cache: 'no-store' });
      if (res.ok) { await c.put('/', res.clone()); await saveShell(await res.text()); }
    } catch (e) { /* offline install — runtime caching fills in */ }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, API]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') { apiGen++; event.waitUntil(caches.delete(API)); }
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App pages (any route is the same single-page app).
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    const network = fetch(req);
    // Save the newest page + its code whenever the network answers — even if the
    // saved copy was already shown because the network was too slow (perf F-14).
    // (This handler is attached first, so it clones before the page reads the body.)
    event.waitUntil(network.then(async (res) => {
      if (!res.ok) return;
      const copy = res.clone();
      const c = await caches.open(SHELL);
      await c.put('/', copy.clone());
      await saveShell(await copy.text());
    }).catch(() => undefined));
    event.respondWith((async () => {
      let timer;
      const slow = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS); });
      try {
        const first = await Promise.race([network, slow]);
        if (first) { clearTimeout(timer); return first; }
        const saved = await caches.match('/');
        if (saved) return saved;
        return await network; // nothing saved yet — keep waiting for the network
      } catch (e) {
        clearTimeout(timer);
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Hashed app code + assets: cache first.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/'))) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(SHELL); c.put(req, res.clone()); }
      return res;
    })());
    return;
  }

  // Supabase data reads: network first, last copy as a fallback. Never auth,
  // functions or storage.
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          // Hand the response to the app at once; save the copy alongside (perf
          // F-13 — the read used to wait for the full body plus the cache write).
          const copy = res.clone();
          const gen = apiGen;
          event.waitUntil((async () => {
            if (gen !== apiGen) return;
            const c = await caches.open(API);
            if (gen !== apiGen) return;
            await c.put(req, copy);
            if (Math.random() < 0.05) await trim(API, MAX_API_ENTRIES);
          })().catch(() => undefined));
        }
        return res;
      } catch (e) {
        const hit = await caches.match(req);
        if (hit) return hit;
        throw e;
      }
    })());
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'SportnNote';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* cross-origin guard */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
