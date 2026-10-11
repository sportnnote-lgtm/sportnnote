# International readiness audit: summary (2026-10-12)

Five read-only auditors covered identity, locale, legal, schools and sport, and distribution. The markets are, in order: Gulf (UAE, Qatar), UK, Singapore and Malaysia, Australia, US.

The founder's decisions behind this audit:
- one database (Mumbai) for every market;
- English only;
- a .com domain alongside the existing .in;
- company and store accounts set up before December 2026;
- new sports: rugby, baseball/softball, ice hockey, netball and American football.

Unconfirmed foreign rules are marked "verify" in each file. Legal items are not legal advice.

| Area | File | P0 | P1 | P2 |
|---|---|---|---|---|
| Identity: sign-in, phone, sharing | identity.md | 4 | 13 | 8 |
| Locale: time, dates, units | locale.md | 4 | 9 | 9 |
| Legal: privacy, minors | legal.md | 6 | 16 | 2 |
| Schools and sport | schools-sport.md | 1 | 12 | 10 |
| Distribution: stores, web, support, accessibility | distribution.md | 6 | 16 | 7 |
| **Total** | | **21** | **66** | **36** |

## Two security issues that apply in India today (wave I-0, being built)

1. **Children's data is readable without signing in (legal L3).** Confirmed on live: anyone with the public app key can read players' name, photo link, city, school, house and bio, and the `media` bucket is public. Date of birth, phone, email and guardian details are protected. Live currently has no minors. The fix: server-side rules so logged-out visitors see adults only, a reduced card for minors shown to unrelated users, private photos for minors, and follow rules for minors.
2. **Phone sign-in can be taken over across countries (identity P0).** Accounts are matched on the last 10 digits, so a US +1 number can match an Indian +91 number. The fix: identify by the full international number everywhere (app, database, the phone-login and verify functions) and add a country picker on every phone field.
   - **Founder step now:** in Firebase, set Authentication → Settings → SMS region policy to India only until the fix ships.

## Overall picture

- **Sport and scoring:** already international, since everything follows the federations and the rules are configurable.
- **What breaks abroad:**
  - phone numbers and sign-in;
  - time zones, defaulting to India time in three different places;
  - date order;
  - school structures (graduation after "Grade 10", U-number age bands only, Indian school-year labels);
  - legal text that is India-only;
  - getting the app at all (APK sideload only, no App Store).
- **Most of it can be done now.** Only the store listings, legal registrations and representatives, signed school data agreements, a COPPA consent-verification vendor, App Links, Apple push keys and payments need the company and store accounts.

## Proposed waves (for founder approval)

**I-0, now (in progress):** protect minors' data, and switch phone identity to full international numbers.

**I-1, region and trust basics (can do now, all markets):**
- **Region settings model:** country determines time zone, date order, 12/24-hour clock, week start, school year, age cut-off, units and speech language. India stays unchanged.
  - Seed the time zone from the device and save it to the profile (fixes IST in reminder emails).
  - Enter kickoff times in the same zone used for display.
  - Work out "today" and calendar days in the right zone, not UTC.
  - Add a time zone per tournament.
  - Month-first dates for the US.
  - "2026" (not "2026–26") for calendar-year school years.
- **Domain-agnostic links, ready for .com:** one base-URL setting; update the send-invite allowlist and deep-link prefixes; .in keeps working forever (printed QR codes, placeholder sign-in emails).
- **Website and legal copy:**
  - remove "Hyderabad pilot" wording;
  - the correct "free while we're new" line;
  - a public account-deletion page;
  - a support contact with hours and time zone;
  - list Anthropic and Cloudflare as service providers;
  - an international policy and terms draft for a lawyer to review.
- **Consent and rights:**
  - a cookie and analytics consent banner (UK and EU);
  - guardian-confirm flow and guardian rights (view, export, delete);
  - data export;
  - deleting ID proofs after review;
  - a notice for players added by organisers.
- **Sharing:** use the share sheet first outside WhatsApp markets.
- **Voice:** en-GB and en-AU recognition for UK and Australian users.

**I-2, schools and markets:**
- **Market presets** (Gulf-British, Gulf-Indian, UK, SG, AU, US): class names and graduating class (fixes the P0 where UK schools never graduate anyone), the 31 Aug cut-off, age bands beyond U-numbers (A/B/C divisions, "12 & Under", grade-based eligibility), school-year dates and terminology.
- **US naming:** Soccer and Field hockey.
- **Units:** swimming short course yards (25 yd); feet and inches for field events.
- **Competition structures:**
  - team levels (Varsity/JV, A/B);
  - weekly fixtures across a term;
  - tournaments that feed one another (county → national, NSG zonal → national, state playoffs).
- **Imports:** CSV roster import.

**I-3, quality abroad:**
- An accessibility pass to WCAG 2.1 AA on the scoring screens, plus a published VPAT. Red badge contrast is 2.82:1, scoring pads have almost no screen-reader labels, and score changes aren't announced.
- Latency: pin edge functions to Mumbai and cache storage.

**I-4, new sports:** netball first (Gulf, UK and SG girls' schools), then rugby union and sevens (try bonus point), baseball/softball, ice hockey (overtime-loss point), and American football starting with flag football.

**I-5, needs company and store accounts:**
- Google Play listing (mixed audience, including children; not Designed for Families).
- App Store listing (privacy labels and age rating drafted in distribution.md).
- Native phone sign-in and Apple push.
- App Links.
- Legal registrations, DPO and UK representative.
- School data agreements.
- A COPPA verification vendor.
- Payments in several currencies with store billing.

## Founder decisions needed

1. **Sports policy:** AFL and rounders are big in Australian and UK schools but have no world championship. Add an exception or not?
2. **US under-13s (COPPA):** until a verification vendor is contracted, block self-signup for US under-13s (the guardian creates the account) — the simplest safe option.
3. **Lawyer:** scope opinions on the UK Online Safety Act and Australia's under-16 social-media rules (messaging, follows, profiles), plus a review of the international policy draft.
4. **Approval:** go ahead with waves I-1 and I-2 now?
