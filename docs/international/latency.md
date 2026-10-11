# Latency for far regions (SD-155 / audit D18)

**Status:** notes and plan. One safe change shipped (upload cache headers). Everything else is listed below with its risk, and nothing has been changed on the live project.

## The situation

- There is one Supabase project in **ap-south-1 (Mumbai)**: Postgres, Auth, Storage, Realtime and the database side of every edge function.
- Rough round trips from users to Mumbai: Gulf 30–50 ms, Singapore 60–80 ms, UK 120–150 ms, Australia 150–180 ms, US 220–280 ms. These are estimates. Measure them before acting (see "Measure first").
- **Scoring is not affected.** Taps are applied on the device straight away and sent through a durable outbox (`src/data/useLiveMatch.ts`), so a scorer in Texas never waits for Mumbai. Followers see each change about one round trip later through Realtime. That delay is fine for live scores.
- **Cold screen loads are affected.** Most screens run several REST calls one after another, so a screen that is 4 sequential reads costs about 4 × RTT: roughly 1 s or more from the US before anything paints.
- The app bundle is already global: the web app is on EAS Hosting / Cloudflare and OTA updates come from Expo's CDN.

## Shipped in SD-155 (safe, small)

| Change | Where | Why it is safe |
|---|---|---|
| `cacheControl: '31536000'` (1 year) on public uploads (logos, banners) | `src/data/repos.ts` `uploadImage` | Every upload goes to a new path (timestamp + random suffix, `upsert: false`), so a cached file can never be stale. Browsers and the Storage CDN can keep it, and a far user downloads each logo from Mumbai once. |
| `cacheControl: '3600'` on private player photos | same | These are read through short-lived signed URLs. One hour matches the signing window, and there is no `immutable`, so a revoked photo is gone within an hour at most. |

Files that were uploaded before this change keep Supabase's default `Cache-Control` (`max-age=3600`). To fix those, re-upload them, or patch `storage.objects.metadata` from the SQL editor. That is a founder action: run it in a quiet hour and check a few images afterwards.

## Next steps (not done here, in priority order)

1. **Measure first (S, no risk).** Add `rtt_ms` and `country` to the analytics `app_open` event (SD-152 analytics, `src/core/telemetry.ts`). Time one cheap `select 1` RPC on cold start, so we have p50/p95 per country before changing anything else.
2. **Batch the first screen into one RPC (M).** Home, Tournament and Live Scoring each run 3–6 sequential selects on open. One `security definer` RPC per screen (for example `home_bootstrap(player_id)` returning feed, follows and unread count as JSON) replaces N×RTT with 1×RTT. RLS must stay correct, so each RPC needs a policy review and tests. This is the biggest win for the US and Australia.
3. **Pin edge functions to Mumbai (S, low risk, needs a live check).** An edge function runs at the edge nearest the caller and then makes several round trips to Mumbai for its queries. For the chatty ones (`verification-submit`, `send-invite`, `join`, `delete-account`, `support-assistant`), pass `region: FunctionRegion.ApSouth1` in `supabase.functions.invoke(…)` (supabase-js v2), or send the `x-region: ap-south-1` header. The user then pays one long hop instead of several. Leave `push-send` unpinned, because it calls FCM/APNs, which are global. Test each function on staging first, because a wrong region string fails the call.
4. **Storage CDN and image transforms (S–M, plan-dependent).** Check that the project's plan includes the Smart CDN. If it does, public `media` objects are cached at the edge automatically. Then use `getPublicUrl(path, { transform: { width: 128 } })` for avatars and logos in lists, so a 4 MB phone photo isn't downloaded for a 40 px circle. Transforms are a paid add-on, so check the cost first.
5. **Prefetch on cold start (S).** While the splash or demo hydrate runs (`App.tsx`), start the Home feed request and the user's follows in parallel instead of after the first render. Also cache the last Home feed in AsyncStorage and show it immediately (stale-while-revalidate), so far users see content at once and fresh data about 1 RTT later. Both changes are client-only, but they touch the data layer, so ship them behind a flag with a test.
6. **Realtime (no action).** Realtime is fine as it is: about one RTT of lag per change. If a US-heavy league ever needs less, the answer is a read replica. Supabase read replicas in us-east-1 serve reads only, while writes and Realtime stay in Mumbai, so that needs a design note first.
7. **A second region (L, later).** Only if a whole market (US schools) needs data residency or less than 100 ms reads. That means a separate project and data partitioning by organisation, which is a company decision and not a performance tweak.

## What not to do

- Don't add `immutable` to anything stored at a reused path (verification docs use `upsert: true`).
- Don't move the database to another region to suit one market: India is still the core user base.
- Don't cache signed-URL responses longer than the signature lifetime.
