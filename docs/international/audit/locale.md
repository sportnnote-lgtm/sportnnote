# International readiness — Locale audit

Area: time zones, dates, numbers, week start, school/season year, units, currency, speech locale, device-locale detection.
Audited 2026-10-11, read-only. Markets in order: Gulf (UAE, Qatar) → UK → SG/MY → AU → US. English only, one database (Mumbai).

## Summary

The core model is sound. Match times are stored as UTC instants, `src/core/time.ts` converts wall time to an instant DST-safely (`wallTimeToIso`), and academic years are dated per organisation. The problem is that **three different clocks are in use**:

1. **The app's chosen zone** is used by match cards, Live, Series, ImportSchedule and the tournament profile. It defaults to `Asia/Kolkata` and is never detected from the device.
2. **The device's own zone** is used by `DateTimeField` entry (kickoff pickers), `toLocale*` calls, the calendar's "today", results timetables and print sheets.
3. **UTC** is used by the calendar day grouping (`startsAt.slice(0,10)`), tournament Live/Upcoming/Completed status, Organize lists and record-book dates.

In India the three rarely disagree, because IST is UTC+5:30 and nothing is scheduled before 05:30. In AU (UTC+10/11) and the US (UTC−4 to −8) they disagree every day. In addition, the server's reminder emails always use IST, because the client never writes `profiles.time_zone`.

Counts: **P0 = 4, P1 = 9, P2 = 9** (22 gaps).

## 1. Gap table

| # | Pri | Gap | Evidence | Markets | Fix (one line) | Size | Needs co./store |
|---|---|---|---|---|---|---|---|
| L1 | P0 | Display zone defaults to IST for everyone and is never read from the device. A Dubai or London user sees every kickoff in IST until they find Settings → Time zone. | `src/core/time.ts:38` `DEFAULT_TIME_ZONE = 'Asia/Kolkata'`; `:41`, `:45-47` (hydrate only reads AsyncStorage); `App.tsx:25` | all | On first run with nothing stored, seed the zone from `Intl.DateTimeFormat().resolvedOptions().timeZone` (works on Hermes and web, no new module), falling back to Asia/Kolkata. | S | no |
| L2 | P0 | Kickoff **entry** uses the device zone, but **display** uses the app zone. A UAE organiser whose app zone is still the IST default types 16:00, which is saved correctly as 12:00Z, and then sees "17:30 GMT+5:30". Bulk import uses the app zone, so the two entry paths disagree. | `src/components/DateTimeField.tsx:84` `new Date(viewY, viewM, day, …)` (device-local); callers `src/screens/ScheduleMatchScreen.tsx:159,285`, `EditMatchScreen.tsx:66,95`, `GenerateFixturesScreen.tsx:443,452` `when.toISOString()`; import uses `wallTimeToIso(…, zone)` `src/data/scheduleImport.ts:17,335` | all (worst where device ≠ app zone) | Make DateTimeField emit wall date+time and convert with `wallTimeToIso(date, time, appZone)`. Show the zone under the picker ("Times in Gulf Standard Time"). | M | no |
| L3 | P0 | Calendar puts matches on **UTC days**. A 9:00 Sydney match is 23:00Z the previous day and shows on the wrong date. A 20:00 New York match shows on the next day. | `src/screens/CalendarScreen.tsx:84,171` `m.startsAt.slice(0, 10)`; `:75` "today" uses device-local; `src/core/dates.ts:9,16` (`formatDay` slices a full timestamp too) | AU, US (Gulf/UK only for late-night or early-morning matches) | Group by `localDay(startsAt, appZone)`, which already exists at `scheduleImport.ts:346`. Move it to `core/time.ts` and use it in the calendar and `formatDay`. | S | no |
| L4 | P0 | Reminder **emails** state the time in IST for everyone. The client never writes `profiles.time_zone`, so the server falls back to Asia/Kolkata. The cron itself is UTC-based (every 5 min) and correct. | `supabase/functions/notify-upcoming/index.ts:215,218,261-262` (fallback `'Asia/Kolkata'`, locale `'en-IN'`); no writer: `grep time_zone src` finds only a comment in `src/core/time.ts:11`; Settings sets local only (`src/screens/SettingsScreen.tsx:106`) | all | Upsert `profiles.time_zone` on sign-in and on every zone change. The server fallback should be the tournament or venue zone (L6), then UTC with an explicit "GMT" label, not IST. | S | no |
| L5 | P1 | Tournament "today" is the **UTC date**. On day 1 in AU an event reads "Upcoming" until 10–11am. In the US it reads "Completed" from about 8pm on the last day, and Organize lists are mis-bucketed the same way. | `src/core/tournament.ts:24,41`; `src/screens/OrganizeScreen.tsx:25,28`; `src/screens/OrganizationScreen.tsx:98,102,117,752,868` `new Date().toISOString().slice(0,10)` | AU, US, (SG/MY mornings) | One `todayIn(zone)` helper in `core/time.ts`, using the tournament zone where one exists, else the app zone. | S | no |
| L6 | P1 | **Tournaments have no home time zone.** Dates are bare `YYYY-MM-DD`, and timetables and print sheets render in whichever zone the printing device is set to. A remote organiser, or a parent in India following a Dubai event, gets mismatched sheets. | `src/data/results/timetable.ts:62,64` (`dayKey`, `hhmm` use device `getHours`); `src/data/results/printSheets.ts:72,96,200`; no `timeZone` field in `src/core/types.ts` (Tournament) | all | Add `tournaments.time_zone`, defaulting to the creator's zone. Use it for entry, timetables, prints, "today" and record dates. Viewers can toggle "event time / my time". | M | no |
| L7 | P1 | Bulk schedule import reads every numeric date **day-first**. A US organiser's `10/12/2026` silently becomes 10 Dec, with no warning even when both parts are 12 or less. | `src/data/scheduleImport.ts:10,141-143,159-160`; UI copy `src/screens/ImportScheduleScreen.tsx:172,196` | US (all others are day-first) | Read date order from region (DMY or MDY). Flag an ambiguous file (every date has both parts 12 or less and no ISO or month name) with a one-tap "day-first / month-first" switch. | S | no |
| L8 | P1 | Bulk athlete paste and the quick-add DOB are day-first only, with hint text "05/03/2012". A US coach pasting a roster gets wrong DOBs, which can wrongly pass or fail age-group eligibility. | `src/data/results/entries.ts:340-358` (`readDob`), `:403,432`; `src/components/results/EntriesPanel.tsx:136,211` | US | Same region date order as L7. Show the parsed DOB as "5 Mar 2012" in the preview row so a misread is visible. | S | no |
| L9 | P1 | The zone picker is a fixed 9-entry list. It lacks Qatar/Riyadh/Bahrain/Kuwait, Kuala Lumpur, Perth/Brisbane/Adelaide/Melbourne, and US Central/Mountain/Phoenix. A detected zone outside the list shows the raw IANA id. | `src/core/time.ts:26-36,62` | Gulf (QA), MY, AU, US | Group by country (from the region model) with every zone per market. Label with a live offset (`zoneAbbrev`), and keep "Other…" search over `Intl.supportedValuesOf('timeZone')` (verify Hermes). | S | no |
| L10 | P1 | `academicYearLabel` always builds "YYYY–YY". A calendar-year school year (SG, AU, and MY since 2025) shows as "2026–26". | `src/core/org.ts:77-78`; used `src/screens/OrganizationScreen.tsx:122,919-928` | SG/MY, AU | Return "2026" when start and end fall in the same year. Seed the first year's dates from the region (Apr–Mar IN, Sep–Aug UK/US, Jan–Dec SG/AU/MY; Gulf schools vary: Indian curriculum Apr–Mar, British/IB Sep–Jun). | S | no |
| L11 | P1 | Player-stats "Season" split is always the calendar year. No caller passes `seasonStartMonth`, so an Indian school season (Apr–Mar) or UK/US season (Sep–Aug) splits across two "seasons". | `src/data/lineContext.ts:58-60,81-89,231` (no caller sets the option); `src/data/teamRecords.ts:294,307` `seasonOf(m.startsAt)` | all (incl. India) | Pass the org's academic-year start month (or region default) into `seasonOf`. Compute it from the local day, not the UTC slice. | S | no |
| L12 | P1 | Swimming has only LCM and SCM. US school and college swimming is 25-**yard** short course (SCY). Times are not comparable across courses, and records or seeds would mix. | `src/data/results/swimming.ts:25-33` (`Course = 'LCM' \| 'SCM'`) | US | Add `SCY` (pool 25 yd, "yards" labels, separate record and PB scope, no conversion). | M | no |
| L13 | P1 | Athletics field marks are metres only. Many US high-school (NFHS) state meets still measure jumps and throws in feet and inches. | `src/sports/athletics/stats.ts` (distance and height in metres); `src/sports/statSchema.ts:375-381` `formatValue` (no unit system) | US | Store metres and accept or display ft-in when the meet's units = imperial. Keep a metric-only rule for records. | M | no |
| L14 | P2 | The time format is mixed. `time.ts` forces `en-GB` 24-hour ("21:00") on cards, while `toLocale*` calls follow the device (often 12-hour), and import messages use "4:30 pm". The US expects 12-hour, while the UK, Gulf and AU accept either. | `src/core/time.ts:69,72,96`; `src/components/DateTimeField.tsx:19,26` (12-hour AM/PM wheel at about line 216); `src/data/scheduleImport.ts:358+` | US (and consistency for all) | Add `hour12` to region settings and route every time render through `core/time.ts`. | S | no |
| L15 | P2 | Around 12 ad-hoc `toLocale*` and `toDateString` calls bypass the app zone and region. Message, history, calendar and golf screens render in device zone and locale, and print footers show US-style "Sun Oct 11 2026". | `src/screens/MessagesScreen.tsx:17-18`, `ConversationScreen.tsx:107`, `LiveScoringScreen.tsx:2579`, `CalendarScreen.tsx:33`, `StandingsScreen.tsx:447`, `VerificationReviewScreen.tsx:105`, `MessageReportsScreen.tsx:69`, `GolfRoundSetupScreen.tsx:360`, `src/components/TournamentHistory.tsx:140`, `ProfileView.tsx:596`, `golf/GolfHandicapCard.tsx:26`, `golf/GolfTournamentHub.tsx:104`; `src/data/results/printSheets.ts:72` | all | Replace them with `formatDate`, `formatTime` and `formatDateTime` from `core/time.ts`, and add a lint rule banning raw `toLocale*`. | S | no |
| L16 | P2 | "IST" is special-cased by string replace. Other zones show "GMT+4" or "GMT-4" rather than GST, AEST or ET. This is cosmetic but uneven. | `src/screens/LiveScoringScreen.tsx:448,698`; `src/screens/TournamentProfileScreen.tsx:303` `.replace('GMT+5:30','IST')` | Gulf, AU, US | Add a `zoneShortName(zone)` map per region (IST, GST, AST, BST/GMT, SGT, MYT, AEST/AEDT, ET/CT/MT/PT), falling back to the GMT offset. | S | no |
| L17 | P2 | Week start is hard-coded to Sunday in the calendar and date picker. UK, AU, SG, MY and UAE use Monday. US, Qatar and Saudi use Sunday. India is mixed, so keep Sunday. | `src/screens/CalendarScreen.tsx:26,99`; `src/components/DateTimeField.tsx:9,88` | UK, AU, SG/MY, UAE | Add `weekStart` to region settings (L-model). | S | no |
| L18 | P2 | Age-group basis presets are 31 Dec, 1 Jan and meet day. UK school sport counts age on 31 Aug, and US state associations vary. A custom cutoff is possible (`isBoardCutoff` allows month-end) but not offered as a preset. | `src/core/age.ts:43-48,58-74` | UK, US, (AU states) | Make presets region-aware, for example "31 Aug (UK school year)", and keep SGFI/CBSE presets for India. | S | no |
| L19 | P2 | Speech recognition: native tries `en-IN` then `en-US`, and web is fixed to `en-US`. Accuracy for UK, AU or SG accents and names is better with a matching locale. | `src/core/speechSetup.native.ts:23`; `src/core/speechNative.ts:72`; `src/core/speech.ts:87` | UK, AU, SG/MY (Gulf: en-IN or en-GB fine) | Use region `speechLangs` (e.g. UK `['en-GB','en-US']`, AU `['en-AU','en-GB']`, SG `['en-SG','en-GB']`), and pass it on web too. | S | no |
| L20 | P2 | Ops analytics and digests are pinned to IST (weekly KPI views, daily digest at 21:00 IST, Mon–Sun IST report window). These are internal only, so users are unaffected. | `supabase/migrations/20261010120000_analytics.sql:261-320`; `supabase/functions/weekly-report/index.ts:50-69,94`; `supabase/release/2026-10-phone-login-0035.sql:114-118` | (internal) | Keep IST as the founder's ops zone. Add a per-market breakdown (country column) later, not a zone change. | S | no |
| L21 | P2 | Road and cycling distances are km only, with no miles. Weightlifting is kg only (IWF standard everywhere; US schools sometimes report lb). Wind in m/s is correct globally. | `src/screens/RoadEventSetup.tsx:42,159,204`; `src/screens/CyclingEventSetup.tsx:175-177,235`; `src/sports/weightlifting/stats.ts:10` | US | Display only: optional "≈ x mi" or "≈ x lb" secondary label when region units are imperial. Store metric, never convert records. | S | no |
| L22 | P2 | Support copy says "default India / IST" in the support knowledge base and guides. It becomes wrong once L1 ships. | `src/data/supportKB.ts:241`; `src/data/supportGuides.ts:184` | all | Reword to "defaults to your phone's time zone". | S | no |

### Not gaps (checked)
- **Currency:** there is no money formatting anywhere. There are no ₹/INR/fee fields in src or the edge functions; entry fees are free text (`src/components/TournamentDetailsFields.tsx:151`). When paid features come, add `currency` to the region model and format with `Intl.NumberFormat`.
- **Number grouping and decimals:** stats use `toFixed`, so there is no lakh/crore grouping to undo. All target markets use "." for decimals.
- **Profile heights and weights:** none are stored, so nothing to convert.
- **Golf:** no yardages are stored (strokes, par and handicap only), so there is no yards-vs-metres issue today.
- **Academic-year model:** stored per organisation with explicit start and end dates (`src/core/types.ts:319-330`), which is already international. Only the label (L10) and the default (L10/L11) are India-shaped.
- **DOB entry in profiles and sign-up** uses the calendar picker (`DateTimeField mode="date"`), not typed text, so it is unambiguous.
- **Reminder cron** fires every 5 minutes against UTC instants (`supabase/release/2026-10-schedule-reminders.sql:9`), so lead times are correct in every zone. Only the email wording is wrong (L4).
- **Push reminder text** is relative ("starts in 1 hour"), so it is zone-free.

### Verify
- Hermes `Intl.DateTimeFormat` with an arbitrary `timeZone`. `time.ts:14-17` says a `@formatjs/intl-datetimeformat` polyfill is needed. RN 0.85 Hermes should support it, but test Asia/Dubai, Europe/London (DST) and Australia/Sydney on the Android APK and iOS before relying on it. If it fails, `fmt()` silently falls back to the device clock while still labelling the app zone.
- `Intl.supportedValuesOf('timeZone')` on Hermes (for L9 "Other…").
- That nothing else reads `profiles.time_zone` (only `notify-upcoming` was found).

## 2. Can do now vs needs company/store accounts

**Can do now (JS/OTA + one migration; no store dependency):** all of L1–L22.
- Device zone, week start and 12/24-hour can be read now without new native code: `Intl.DateTimeFormat().resolvedOptions()` gives the zone, `hourCycle` and locale. That is enough for L1, L14 and L17 as an OTA update.
- L6 needs one migration (`tournaments.time_zone text`) run through the founder's SQL editor.
- L4 needs only a client write to the existing column.

**Optional native step:** `expo-localization`. It is not installed today: it is absent from package.json, while `"expo": "~56.0.11"`. Per the SDK 56 docs it gives `getLocales()` (`regionCode`, `measurementSystem` `'metric'|'us'|'uk'`, `currencyCode`, `temperatureUnit`) and `getCalendars()` (`timeZone`, `firstWeekday`, `uses24hourClock`), plus `useLocales()` and `useCalendars()`. Several fields are null on web. Install with `npx expo install expo-localization` and add it to `app.json` plugins. It needs a **new binary**, so it cannot ship OTA. The Android APK can be built now. The iOS App Store build depends on the store accounts. It is a nice-to-have for guessing the country and units; the `Intl` fallback covers the P0s.

**Needs company/store accounts:** none of the locale fixes strictly need them. The only link is the timing of the `expo-localization` native build on iOS, and choosing the store listing's countries and regions, which should match the region list below.

## 3. Proposed "region settings" model (India unchanged)

There is one `Region` record per country. It is stored on the **profile** (viewer preferences) and on the **organisation and tournament** (event defaults, which win for entry, prints and "today"). Every value can be overridden individually.

```ts
interface RegionSettings {
  country: 'IN'|'AE'|'QA'|'GB'|'SG'|'MY'|'AU'|'US'|string;
  timeZone: string;                 // IANA; default = device zone, else the country's main zone
  dateOrder: 'DMY'|'MDY';           // typed/pasted dates (import, DOB paste)
  hour12: boolean;                  // time display
  weekStart: 0|1|6;                 // Sun | Mon | Sat
  schoolYearStartMonth: number;     // seeds academic years + stats "Season" split
  ageCutoff: 'dec31'|'aug31'|...;   // default age-group basis for meets
  units: { swimCourse: 'LCM'|'SCM'|'SCY'; field: 'metric'|'imperial'; distance: 'km'|'mi' }; // display only; store metric
  speechLangs: string[];
  zoneShortNames?: Record<string,string>;
}
```

| Country | Zone(s) | Date | Clock | Week | School/season start | Age cut-off | Units | Speech |
|---|---|---|---|---|---|---|---|---|
| **IN (unchanged)** | Asia/Kolkata (IST) | DMY | 12-hour on input, as today | Sun | Apr (stats season Apr–Mar) | dec31 / board (SGFI, CBSE) | metric, LCM | en-IN, en-US |
| AE | Asia/Dubai (GST) | DMY | 12-hour | Mon | per school: Apr (Indian curriculum) or Sep | dec31 | metric | en-IN, en-GB |
| QA | Asia/Qatar (AST) | DMY | 12-hour | Sun | per school: Apr or Sep | dec31 | metric | en-GB, en-IN |
| GB | Europe/London (GMT/BST) | DMY | 24-hour | Mon | Sep | aug31 | metric (SCM common) | en-GB |
| SG / MY | Asia/Singapore, Asia/Kuala_Lumpur | DMY | 12-hour | Mon | Jan | dec31 | metric | en-SG, en-GB |
| AU | Sydney/Melbourne/Brisbane/Adelaide/Perth | DMY | 12-hour | Mon | Jan | state-specific; default dec31 | metric | en-AU, en-GB |
| US | New_York/Chicago/Denver/Phoenix/Los_Angeles | **MDY** | 12-hour | Sun | Aug/Sep | varies; offer custom | **SCY, ft-in field, miles display** | en-US |

Rules:
- India behaviour is unchanged. IN is the fallback region, and its values equal today's hard-coded behaviour, so nothing moves for existing users.
- The zone comes from the device first. The country comes from the phone number's dial code at sign-up or from the device locale, and the user can change it in Settings → Region. That replaces Settings → Time zone, with the zone as a sub-row.
- The event zone wins for **entry** (kickoff pickers, import, timetables, prints, "today", record dates). The viewer zone wins for **display** on cards and Live, with "event time" shown when the two differ.
- Units are display and entry only. Always store SI (metres, kg, seconds) plus the course, so records stay comparable.
- All formatting goes through `src/core/time.ts` and a new `src/core/region.ts`. Raw `toLocale*` and `toISOString().slice(0,10)` for "today" are lint-banned.

## 4. Top 5 (locale)

1. **L1 + L4: detect the device zone and sync it to `profiles.time_zone`.** Stops every non-India user seeing IST times in the app and in reminder emails (S, OTA).
2. **L2: make kickoff entry use the same zone as display.** `DateTimeField` should go through `wallTimeToIso(..., zone)`, so organisers abroad stop creating confusing times (M).
3. **L3 + L5: compute "day" and "today" in a time zone, not UTC.** Fixes the calendar day, tournament status and Organize lists for AU and the US (S).
4. **L6: give each tournament a home time zone.** Timetables, prints, entry and record dates then follow the venue, not the device (M + 1 migration).
5. **L7/L8/L10/L11: the region model.** Covers date order (US month-first in import and DOB paste), school-year labels ("2026" not "2026–26") and season splits, with India values unchanged (S each).
