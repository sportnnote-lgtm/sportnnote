# docs/marketing: social content for LinkedIn, Instagram and YouTube

Ready-to-post drafts for SportnNote's social channels (@sportnnote, handles not created yet). The repo files are the source of truth. The Claude Doc "SportnNote social launch roadmap" (https://claude.ai/code/artifact/0ddd65b3-bb12-4401-8a6c-db30e8638b54) holds the strategy and a summary of this calendar.

**Nothing here has been posted.** Every file is a draft until the founder approves it.

## What's in the folder

| Path | What it is |
|---|---|
| `content-calendar.md` | Every planned post from 7 Dec 2026 to 14 Mar 2027: date, IST time, platform, format, title, pillar, status and a link to its file. Then the Next season backlog and the International launch track (approved 12 Oct 2026; Gulf and UK rows in local time, all 18 copy-ready since batch 9, gated on company/store accounts, .com, Firebase SMS countries and lawyer review) |
| `posts/YYYY-MM-DD-platform-slug.md` | One file per post. YouTube Shorts and Reel-to-Short cuts sit inside the file of the video they're cut from, under `## YouTube Short` |
| `README.md` | This file |

### What every post file contains
- A metadata table: publish date and time (IST), platform and format, pillar, the guide it mirrors, status, and AI use.
- The caption or post text exactly as it will be posted, in a code block. Fill anything in `[BRACKETS]` before approval.
- Hashtags, alt text, and the call to action with its link (sportnnote.in, app.sportnnote.in or sportnnote.in/guides/…).
- Slide-by-slide copy for carousels and document posts.
- For Reels, Shorts and YouTube videos: a timed script with on-screen text, the shot list (which app screen to record, which demo data) and the voice-over word for word.
- The AI-disclosure setting, and pre-post checks.

## Approval flow
1. **Draft.** The content agent writes or updates the file and the calendar row (status `Draft – …`). It takes facts from DEVLOG.md, docs/sport-depth/PROGRESS.md and website/guides/*.md.
2. **Founder review.** The founder reads the file, edits the copy into their own voice where it's a founder post, and fills any `[BRACKETS]`.
3. **Approved.** The founder changes the status in the calendar row to `Approved` (and the status line in the file).
4. **Produce.** Record screens, build slides and edit. For LinkedIn founder videos, the founder films. Recheck every button label against the frozen launch build (freeze: 23 Nov–6 Dec).
5. **Schedule.** Queue it in the scheduler at the listed time. Change the status to `Scheduled`.
6. **Posted.** After it goes out, change the status to `Posted` and add the live URL to the row.

A post marked "only if SDxxx is in the live build" stays unscheduled until that feature ships.

## Rules every draft follows (founder decisions)
- **Pricing:** "free" only together with "free while we're new; a small fee later, announced well in advance (30 days' notice)". Launch-week posts carry the full line.
- **AI:** AI-arranged screens and the AI presenter or voice are fine for product videos, disclosed per platform:
  - YouTube: "Altered or synthetic content" = Yes, plus a line in the description;
  - Instagram: the "AI info" label.
- **On camera:** the founder appears in person for the LinkedIn launch video and major announcements. Never use AI faces as users, students, coaches or testimonials.
- **Minors:**
  - only with written guardian consent plus the school's permission;
  - never full name + school + face together;
  - without both consents, show hands, phone screens and scoreboards only.
- **No competitor names.**
- **Every sport is equal.** 29 sports are live: cricket, football, hockey, handball, basketball, volleyball, kabaddi, tennis, badminton, table tennis, squash, padel, pickleball, carrom, chess, golf, athletics (track and field, road, race walks, cross-country and combined events), swimming, weightlifting, shooting, archery, rowing, canoe sprint, cycling, netball, rugby (union and sevens), ice hockey, baseball & softball (one sport in the count, as on the site) and American football (flag and tackle) (the site's sport list in `scripts/build-website.mjs`, 12 Oct 2026). Combined events (decathlon, heptathlon, school pentathlon and tetrathlon) are live since 11 Oct 2026 and can be announced, as part of athletics: they never add to the count. Cricket is never the lead by default.
- **Children's privacy:** describe how the app protects children today (guardian consent, initials for strangers, no direct messages to children, data export). Never imply a past exposure, never say "now" or "fixed", never claim legal compliance or certification.
- **Bug fixes aren't features.** Don't market a fix (e.g. SD-119, stat lines that named the wrong opponent) as new. At most one optional "your history is right" trust line.
- **One call to action per post.**

- **International posts** (the approved International launch track): local time first (GST/BST) with IST in brackets; local school words (houses, sports day, fixtures, gala, "Year 7", Grade or Year as the school uses); no India-only wording (Republic Day, Class X, the Hyderabad pilot); no prices in local currencies; no "now available in" or office claims; nothing scheduled until the market's gates in the calendar are met.

## Demo data for recordings
- **Account:** record only on a dedicated marketing demo account, with the tournament **SportnNote Demo Meet 2026** (Hyderabad).
  - Houses: **Red, Blue, Green and Yellow House**.
  - Players: fictional adults (e.g. Ravi, Arjun, Kabir, Dev, Veer, Rahul, Imran, Asha Rao, Priya, Meera).
  - No photos of real people.
- **International recordings:** a second tournament on the same account, **SportnNote Demo Meet 2027**, region and time zone UAE, plus a UK copy, **SportnNote Demo Meet 2027 (UK)** (region United Kingdom, Europe/London, hosted by the fictional **SportnNote Demo School** on the United Kingdom school system), the same four houses, fictional adult players (e.g. Omar, Yusuf, Hamad, Daniel, Sara, Mariam, plus the names above). Students on school-setup screens are placeholders ("Demo Student A").
- **Never record the dev seed's FIFA World Cup replay data:** it uses real footballers' names.
- **On screen:** a small "Demo data" label for the whole clip. Do Not Disturb on, and demo phone numbers only.

## Up next: handles, then paid promotion

**Founder, 13 Oct 2026:** the next session starts with **creating the social handles** (the priority task), followed by a **discussion on paid promotion** for the international posts. The content agent doesn't create accounts; the founder does, from the company's own email. This checklist is ready so that session can start fast.

### Handle checklist (draft)

| Platform | What to create | Handle / URL (first choice) | Notes |
|---|---|---|---|
| Instagram | Professional account → Business, category "App page" | @sportnnote | Turn on the "AI info" label workflow before the first AI-voiced Reel. Link a Facebook Page so posts can be scheduled from Meta Business Suite. |
| Facebook | Page (needed by Instagram's business tools; light posting) | facebook.com/sportnnote | Owned by a Meta Business portfolio in the company's name, not a personal profile. |
| LinkedIn | Company page (the founder's own profile is the admin and posts the founder pieces) | linkedin.com/company/sportnnote | Add a second admin when there is one. Company pages reshare the founder's posts (7 Apr, 14/21/28 Apr). |
| YouTube | Channel on a Brand Account (so ownership can be shared or transferred) | @sportnnote | Verify the channel (phone) for custom thumbnails and videos over 15 minutes. "Altered or synthetic content" is set per video. |
| Reserve only (no posting plan yet) | Threads (comes with Instagram), X, TikTok (not available in India; for later markets), WhatsApp Channel | @sportnnote | Reserve the name so nobody else takes it; leave them empty or point to sportnnote.in. |

- **One name everywhere:** **@sportnnote**, display name **SportnNote**. If it's taken anywhere, use the same fallback on every platform, in this order: **@sportnnote.app** (Instagram, Threads, TikTok allow dots) or **@sportnnoteapp** (where dots aren't allowed), then **@getsportnnote**. Don't mix fallbacks across platforms. One handle serves every market; posts are targeted by region, not by separate handles (roadmap proposal, still the plan).
- **Profile picture:** the S:N logo on the brand background, the same file on every platform. Banner: the 29-sport grid from the 29 Dec post (LinkedIn, YouTube).
- **Link in bio:** **https://sportnnote.in** everywhere (it links to the app and the guides). Switch to the .com when the domain move is done (`docs/international/domain-move-com.md`). No link shorteners, no tracking parameters.
- **Bio lines** (draft; no "free" in bios, because the free-while-new line doesn't fit):
  - Instagram (≤150 characters): `Live scores, results and records for school and club sport 🏅 29 sports, each by its own international rules. Guides 👇`
  - LinkedIn tagline (≤120): `Live scoring, results and records for school sport: 29 sports, each by its own international rules.`
  - LinkedIn About (first line): `SportnNote helps schools, clubs and organisers score every sport the way its federation does, and keeps every result, record and career page in one place.`
  - YouTube description: `How-tos for scoring 29 sports and running sports days, leagues and tournaments on SportnNote. Some videos use an AI presenter and voice; we always say so in the description. Guides: sportnnote.in/guides`
- **Account hygiene:** sign up with a company address (e.g. a shared social@ mailbox on the company domain), not a personal one; two-factor authentication on every account; record who holds admin access in the company's own password manager (never in this repo or in chat).
- **Category and contact:** "Software" / "App page"; contact button = the support email on sportnnote.in/support/. No phone number on public profiles.
- **Before the first post:** the handles are reserved and the profiles complete, but nothing is posted until a post is Approved (see Approval flow). Update "@sportnnote (handles not created yet)" at the top of this README and in the calendar once they exist.

### Paid promotion: points for the discussion
- Which posts: the international how-tos and trust posts are the evergreen candidates; launch-week India posts are organic.
- Where: Meta (Instagram) and LinkedIn first; YouTube in-feed for the how-tos.
- Who: adults only (PE staff, organisers, parents). Never target or build audiences of under-18s; check each platform's teen-ad rules.
- Gates: no paid reach in a market before its International launch track gates are met; every ad keeps the house rules (free-while-new line with "free", AI disclosure, no competitor names, no prices in local currencies).
- Budget, test size and who approves spend: founder to decide.

## Changelog
- **2026-10-11:** first batch.
  - `content-calendar.md`: 140 dated rows, 7 Dec–14 Mar.
  - 36 post files with full copy, covering 46 calendar rows (Shorts included): every post from 7 Dec to 3 Jan, the cricket how-to (9 Jan), the three launch-day posts (11 Jan), how-tos #4–#6, and the new-feature posts.
  - YouTube how-tos #1–#6 have full transcripts.
  - New-feature posts: hockey, athletics track and field, swimming, racket "how the point was won" (SD-107), the End / Restart safety confirms (SD-106) and invite QR sharing (SD-108). SD-106/107/108 posts are gated on those features shipping.
- **2026-10-11:** second batch, match-day safety (SD-112, SD-114, SD-115, SD-116, all live 11 Oct 2026).
  - `content-calendar.md`: 9 new rows in free Thursday slots, one or more per sport family. LinkedIn 09:30 on 21 Jan (football, hockey, basketball, kabaddi corrections), 4 Feb (racket: who serves first), 11 Feb (chess, golf, carrom deciders) and 18 Feb (athletics and swimming: "Check this mark"). Instagram Reels at 19:00 plus YouTube Shorts at 18:00 on 25 Feb (athletics and swimming) and 11 Mar (racket).
  - 6 new post files with full copy (`2027-01-21-linkedin-match-day-mistakes`, `2027-02-04-linkedin-racket-who-serves-first`, `2027-02-11-linkedin-one-tap-shouldnt-decide-a-match`, `2027-02-18-linkedin-a-typo-isnt-a-record`, `2027-02-25-instagram-check-this-mark`, `2027-03-11-instagram-racket-right-side-every-point`).
  - SD-106, SD-107 and SD-108 are live, so their posts are no longer "only if shipped" (21 Jan, 28 Jan ×2, 11 Feb, plus the notes in the 27 Dec carousel and how-tos #2 and #6). The QR posts keep one caveat: the Android app shares the QR image only from the next APK. Also corrected "on Android it opens straight in the app" to "the page offers to open it in the app".
  - Totals recounted: 148 rows (the first batch was 139, not 140), 54 copy-ready in 42 files.
- **2026-10-11:** third batch: three new sports, 20 sports live, cricket SD-113, golf admin, built for match day.
  - **Sport count:** 17 → 20 everywhere (README, calendar, and every post that gives the count or the list): handball, weightlifting and shooting added. The trailer grid, the 11 Dec "Name a sport" Reel and the launch-day Short now show 20 sport clips (shorter per-clip timings). The reveals are renumbered "Reveal N of 10"; the hockey reveal (3 Jan) no longer says it's the last one.
  - `content-calendar.md`: 15 new rows in free slots (one post a day per platform at most): LinkedIn 29 Dec ("20 sports, one scoring standard") and 4 Mar (golf admin and stats); Instagram reveals 8–10 on 5, 7 and 9 Jan (handball, weightlifting, shooting); Instagram Reel + Short on 19 Jan (built for match day: screen on, tap buzz, 60 s result hold) and 2 Feb (cricket SD-113); YouTube sport how-tos + Shorts on Mon 1 Feb (handball), Mon 22 Feb (weightlifting) and Mon 1 Mar (shooting).
  - 10 new post files with full copy: `2026-12-29-linkedin-20-sports-one-standard`, `2027-01-05-instagram-reveal-handball`, `2027-01-07-instagram-reveal-weightlifting`, `2027-01-09-instagram-reveal-shooting`, `2027-01-19-instagram-built-for-match-day`, `2027-02-01-youtube-howto-handball`, `2027-02-02-instagram-cricket-match-day`, `2027-02-22-youtube-howto-weightlifting`, `2027-03-01-youtube-howto-shooting`, `2027-03-04-linkedin-golf-wd-dq-and-stats`. The three how-tos have full transcripts.
  - The 30 Dec team-sports reveal got pre-post checks for the SD-117 basketball and volleyball label changes.
  - The match-day post is gated for the phone app: screen-on and buzz need the APK built after 11 Oct 2026 (the web app already has them).
  - Totals: 163 rows (28 LinkedIn, 71 Instagram, 64 YouTube: 27 long, 37 Shorts), 69 copy-ready in 52 files.
- **2026-10-11:** fourth batch: four new sports, 24 sports live, depth features.
  - **Sport count:** 20 → 24 everywhere (README, calendar, and every post that gives the count or the list): archery, rowing, canoe sprint and cycling added; athletics now also covers road races, race walks and cross-country. The trailer grid and the 29 Dec LinkedIn grid are 6 × 4; the 11 Dec "Name a sport" Reel runs 24 icons at ~0.37 s; the launch-day Short is 35 s with a 1-second clip per sport. The how-tos' "don't mention archery" notes now say don't mention combined events (heptathlon/decathlon), which are still being built.
  - **Reveal or first season:** the four new sports are first-season spotlights ("The newest four, N of 4": archery 30 Jan, rowing 20 Feb, canoe sprint 27 Feb, cycling 6 Mar), not extra reveals. The reveal phase already had 16 Instagram posts in 21 days, and adding four would mean renumbering all ten reveals. The reveals stay "of 10"; the 9 Jan shooting reveal now says 24 sports go live and the other four get spotlights after launch.
  - `content-calendar.md`: 15 new rows in free slots, at most one new Instagram post a week: LinkedIn 14 Jan ("24 sports: the four we added last"), 25 Feb (sports day essentials: cross-country house team scores, road races, race walks) and 11 Mar (fair play: football suspensions, kabaddi cards, racket conduct); Instagram spotlights on Saturdays 30 Jan, 20 Feb, 27 Feb and 6 Mar, the chess clubs Reel (Sat 13 Feb) and the golf for schools carousel (Tue 9 Mar); YouTube how-tos + Shorts on Mondays 25 Jan (archery), 15 Feb (rowing and canoe sprint, one episode) and 8 Mar (cycling).
  - 12 new post files with full copy: `2027-01-14-linkedin-24-sports-the-newest-four`, `2027-01-25-youtube-howto-archery`, `2027-01-30-instagram-spotlight-archery`, `2027-02-13-instagram-chess-clubs-ratings-wall-chart`, `2027-02-15-youtube-howto-regatta-canoe-sprint`, `2027-02-20-instagram-spotlight-rowing`, `2027-02-25-linkedin-sports-day-cross-country-team-scores`, `2027-02-27-instagram-spotlight-canoe-sprint`, `2027-03-06-instagram-spotlight-cycling`, `2027-03-08-youtube-howto-cycling`, `2027-03-09-instagram-golf-for-schools`, `2027-03-11-linkedin-fair-play-on-the-record`. The three how-tos have full transcripts.
  - Renamed `2026-12-29-linkedin-20-sports-one-standard` → `2026-12-29-linkedin-24-sports-one-standard` (federation line adds World Archery, World Rowing, ICF and UCI).
  - Depth features without a post of their own (volleyball rotation and subs, racket doubles serve order, padel Star Point, basketball timeouts and game flow, football own goals and shootouts, cricket captaincy and keeper stats) are listed in the calendar's coverage checks against the outlined how-tos they belong in.
  - Totals: 178 rows (31 LinkedIn, 77 Instagram, 70 YouTube: 30 long, 40 Shorts), 84 copy-ready in 64 files.
- **2026-10-11:** fifth batch: combined events, team ties, records, team pages and head-to-head, carrom and volleyball depth (all live 11 Oct 2026), APK 37.
  - **Combined events announceable:** the "don't announce combined events" rule is lifted (README, calendar, the six sport how-tos, the 29 Dec and 14 Jan LinkedIn posts). They're part of athletics; the count stays 24. How-to #4 (12 Jan) got an optional end-screen note pointing to the new combined-events how-to.
  - `content-calendar.md`: 11 new rows in free slots, at most one new Instagram post a week. YouTube how-tos + Shorts on the two free Mondays: 18 Jan (combined events) and 8 Feb (team ties). Instagram: 26 Jan Reel (combined events, Republic Day meets week), 6 Feb Reel (head-to-head, form and team records), 9 Feb carousel (team ties), 16 Feb carousel (tournament Records), 2 Mar carousel (volleyball detailed stats). LinkedIn: Wed 10 Feb 09:30, team ties for PE heads (every Tue/Thu slot was taken; fallback: fold into the Tue 9 Feb founder post). YouTube Short Thu 18 Feb 18:00 (carrom score sheet).
  - **Outlines now written:** the 18 Feb carrom Reel (with the ICF score sheet and penalty boards) and YT #17 "How to score a volleyball match" + its Short (24 Feb; rotation, subs, libero and detailed stats complete it).
  - 10 new post files with full copy: `2027-01-18-youtube-howto-combined-events`, `2027-01-26-instagram-combined-events-house-pentathlon`, `2027-02-06-instagram-head-to-head-and-form`, `2027-02-08-youtube-howto-team-ties`, `2027-02-09-instagram-team-ties-carousel`, `2027-02-10-linkedin-team-ties-for-schools`, `2027-02-16-instagram-tournament-records`, `2027-02-18-instagram-carrom-score-sheet`, `2027-02-24-youtube-howto-17-volleyball`, `2027-03-02-instagram-volleyball-best-attacker`. The three YouTube videos have full transcripts.
  - **APK 37** (keep-awake, haptics, in-app QR image share) is the download on sportnnote.in: the 19 Jan "Built for match day" APK gate is met (status and checks updated), and the 28 Jan QR posts lose their "next APK" caveat.
  - **Team-tie alert:** "one alert per tie" needs the redeployed `notify-followers` edge function; the three team-tie posts carry that pre-post check.
  - Totals: 189 rows (32 LinkedIn, 82 Instagram, 75 YouTube: 32 long, 43 Shorts), 98 copy-ready in 74 files.

- **2026-10-11:** sixth batch: Waves A, B and C (knockouts, seeding, double elimination, discipline and walkovers, team-tie operations, meet management), "built for real school and inter-school competitions".
  - `content-calendar.md`: 3 new rows and 5 outline rows written. New: YouTube how-to "Run your sports day from entries to champions" (Thu 21 Jan 10:00, full transcript) + its Short (18:00), and a standalone YouTube Short "Lose once, still in: double elimination" (Thu 4 Feb 18:00). Upgraded outlines: Wed 13 Jan LinkedIn → "The sports day toolkit" (PE heads; document post); Mon 1 Feb Instagram Reel → knockouts always produce a winner (replaces "Generate a round-robin in 20 seconds"); Wed 3 Feb carousel → fair play: cards, bans and walkover scores (replaces "Points-table rules per sport"); Wed 17 Feb carousel → "Your school's records, safe" (keeps the PB/SB/MR/SR explainer); Wed 24 Feb carousel → "Sports day from the stands" (alerts, champions, house pages; replaces "Your athletics day, step by step").
  - **No new Instagram or LinkedIn rows:** every Tue/Thu LinkedIn slot is taken and Instagram is at its weekly limit, so the Instagram items upgrade outlines. A **Next season backlog** (16 Mar–3 Apr, plus two gated ideas) at the end of the calendar holds what didn't fit, including the two replaced outline ideas.
  - 7 new post files with full copy: `2027-01-13-linkedin-sports-day-toolkit`, `2027-01-21-youtube-howto-sports-day-entries-to-champions`, `2027-02-01-instagram-knockouts-always-a-winner`, `2027-02-03-instagram-fair-play-every-team-sport`, `2027-02-04-youtube-short-double-elimination`, `2027-02-17-instagram-your-schools-records-safe`, `2027-02-24-instagram-sports-day-from-the-stands`.
  - **Team-tie label update (SD-127):** the 8 Feb how-to, 9 Feb carousel and 10 Feb LinkedIn post now say captains enter their own lineups, sealed until both are in (the other side sees **✓ In**), the tie settles itself, and dead rubbers go **🔀 By stage** (groups play all, knockouts stop). Old labels **⏹ Stop — rest not played** / **▶️ Play the dead rubbers** are now **⏹ Always stop** / **▶️ Always play them**.
  - The 11 Mar LinkedIn fair-play post got an optional bullet for hockey, handball and basketball discipline and walkover scores.
  - **Gates:** final/record alerts need migration `20261019124310_event_result_alerts.sql` + the `notify-followers` redeploy; "two finals at once" record claims need `20261019124330_field_record_book.sql`; captain lineups need `20261019123500_team_tie_ops.sql`. Phone printing needs APK 38; posts say "from a computer" until then. Demo recordings use the Open category with fictional adults (no invented U14 children).
  - Totals: 192 rows (32 LinkedIn, 82 Instagram, 78 YouTube: 33 long, 45 Shorts), 106 copy-ready in 81 files.


- **Founder decisions 2026-10-11 (batch 5):** Republic Day (Tue 26 Jan) product Reel approved; Wednesday 10 Feb LinkedIn team-ties post approved as scheduled. `notify-followers` is redeployed (one alert per tie is live).

- **Live status 2026-10-11 (after batch 6):** all four migrations are run on live — `20261019123220_golf_course_edit`, `20261019123500_team_tie_ops`, `20261019124330_field_record_book`, `20261019124310_event_result_alerts` — and `notify-followers` is redeployed, so the migration-dependent pre-post checks are met. Phone (Android) printing still needs APK 38 — keep "print from a computer".

- **2026-10-12:** seventh batch: netball, rugby and ice hockey (27 sports live), international work, accessibility, APK 38 voice.
  - **Sport count:** 24 → 27 everywhere (README, calendar, and every post that gives the count or the list): netball, rugby (union and sevens) and ice hockey added. The 11 Dec "Name a sport" Reel shows 27 icons at ~0.33 s (team sports first), the trailer grid has 27 tiles, the launch-day Short is 38 s, and the 29 Dec grid is 9 × 3. Renamed `2026-12-29-linkedin-24-sports-one-standard` → `2026-12-29-linkedin-27-sports-one-standard` (federation line adds World Netball, World Rugby and IIHF) and `2027-01-14-linkedin-24-sports-the-newest-four` → `2027-01-14-linkedin-27-sports-four-field-sports` (now "27 sports: four that aren't team against team"; names the three team sports as coming spotlights). The 9 Jan shooting reveal names all seven sports outside the reveals.
  - **Series:** the three new sports are "Three new team sports, N of 3" (netball 23 Jan, rugby 15 Feb, ice hockey 13 Mar); the archery–cycling spotlights are renamed "Four more sports, N of 4" in their files and the calendar.
  - `content-calendar.md`: 11 new rows and 1 outline upgraded. YouTube how-tos + Shorts on free Thursdays: netball 28 Jan, rugby 11 Feb, ice hockey 4 Mar (full transcripts). Instagram: netball Sat 23 Jan, children's-data carousel Tue 23 Feb, ice hockey Sat 13 Mar (one new Instagram post a week at most); rugby Mon 15 Feb upgrades the "Your career page in 15 seconds" outline (moved to the backlog). YouTube standalone Short Tue 26 Jan: spoken voice scoring (APK 38). LinkedIn Fri 12 Mar: "Built for schools everywhere" (Friday exception; every Tue/Thu slot is taken).
  - 9 new post files with full copy: `2027-01-23-instagram-spotlight-netball`, `2027-01-26-youtube-short-voice-scoring`, `2027-01-28-youtube-howto-netball`, `2027-02-11-youtube-howto-rugby`, `2027-02-15-instagram-spotlight-rugby`, `2027-02-23-instagram-protecting-childrens-data`, `2027-03-04-youtube-howto-ice-hockey`, `2027-03-12-linkedin-built-for-schools-everywhere`, `2027-03-13-instagram-spotlight-ice-hockey`.
  - **Corrections (team events live, SD-137b):** the archery how-to's close and limits, the cycling how-to's 8:05 card and limits, the archery and cycling spotlights' checks, and the 14 Jan post no longer call archery team events, team pursuit or team sprint "not yet". Madison, omnium and canoe slalom stay "not yet".
  - **APK 38:** spoken voice scoring is gated on APK 38 being the download on sportnnote.in. Phone printing: the two printing posts (13 Jan, 21 Jan) keep "from a computer" until the meet-timetable-and-printing guide drops "needs the next app update"; each has a check. The backlog's phone-printing Reel waits for the same guide change.
  - **Backlog:** + team events (archery, shooting, cycling, mixed relays), basketball/3×3/futsal clocks, competition rules for meets, tournament history and team journeys, the moved career-page Reel; the cricket rain Reel now includes the live DLS par chip and rain cut. Wave D items without a post are mapped to outlined rows in the calendar's coverage checks.
  - **International launch track (proposal):** a new calendar section after the backlog, marked "proposal — pending founder approval and company/store accounts": gates, a Gulf vs UK angles-and-channels table, and 16 proposed rows from 17 Mar to 1 May 2027 in local time (GST/BST) with IST. India-first calendar unchanged.
  - Totals: 203 rows (33 LinkedIn, 85 Instagram, 85 YouTube: 36 long, 49 Shorts), 118 copy-ready in 90 files.

- **Founder decisions 2026-10-12 (batch 7):** international launch track approved; Friday LinkedIn (12 Mar) and the extra Instagram posts in the weeks of 23 Jan and 23 Feb approved. APK 38 is the sportnnote.in download; privacy migrations and guardian-consent are live; team levels + feeders migration is live.

- **2026-10-12:** eighth batch: baseball & softball and American football (29 sports live), International launch track approved.
  - **Sport count:** 27 → 29 everywhere (README, calendar, and every post that gives the count or the list): baseball & softball (SD-144, WBSC; one sport in the count) and American football incl. flag (SD-147). The "Name a sport" Reel runs 29 icons at ~0.31 s, the trailer grid has 29 tiles, the launch-day Short is 40 s, the 29 Dec grid is 6 × 5 (logo as the last tile). Renamed with `git mv`: `2026-12-29-linkedin-27-sports-one-standard` → `2026-12-29-linkedin-29-sports-one-standard` (federation line adds WBSC and IFAF) and `2027-01-14-linkedin-27-sports-four-field-sports` → `2027-01-14-linkedin-29-sports-four-field-sports` (names five team sports as coming spotlights); calendar links updated. The 9 Jan shooting reveal names nine sports outside the reveals. Every "don't name baseball, softball or American football" check now says baseball and softball count as one sport.
  - **New sports, first season ("Two more sports, N of 2", American football first, flag leading):** YouTube how-tos with full transcripts in the free Thursday long-video slots, Thu 18 Feb (flag and American football) and Thu 25 Feb (baseball and softball), with their Shorts on Fri 19 and Fri 26 Feb 18:00 (the Thursday Shorts slots were taken). Instagram spotlights upgrade two outlines that repeated earlier posts: Mon 22 Feb (was "Run a high jump with the O/X grid") and Mon 1 Mar (was "Livestream a college match with the overlay"); both ideas moved to the backlog.
  - **International launch track:** now the approved plan, not a proposal. Gates kept and linked to `docs/international/go-live-checklist.md` (company and store accounts, .com, Firebase SMS countries, lawyer review; feeders and privacy migrations marked done). New Gulf row: Sat 10 Apr flag football re-cut for American-curriculum schools. New "Later markets" idea table (Singapore/Malaysia, Australia, US) where baseball & softball and flag football lead. Full post files for the first eight rows (Gulf, two shared with the UK).
  - 12 new post files with full copy: `2027-02-18-youtube-howto-american-football`, `2027-02-22-instagram-spotlight-american-football`, `2027-02-25-youtube-howto-baseball-softball`, `2027-03-01-instagram-spotlight-baseball-softball`, `2027-03-17-linkedin-gulf-one-app-both-curricula`, `2027-03-18-instagram-gulf-venue-time-zones`, `2027-03-21-instagram-gulf-netball`, `2027-03-24-linkedin-gulf-new-school-year-april`, `2027-03-27-youtube-howto-set-up-your-school` (full transcript, en-GB voice), `2027-03-31-instagram-gulf-sports-day-move-a-session`, `2027-04-07-linkedin-gulf-uk-childrens-data`, `2027-04-08-instagram-gulf-swimming-gala`.
  - **Other updates:** the 12 Mar "Built for schools everywhere" post keeps its feeder-league sentence (migration live) and points to the approved track.
  - Totals: India calendar 207 rows (33 LinkedIn, 85 Instagram, 89 YouTube: 38 long, 51 Shorts), 124 copy-ready in 94 files; International launch track 17 rows (+ 6 later-market ideas), 8 copy-ready in 8 files; 102 post files in all.

- **Founder decisions 2026-10-13 (batch 8 questions):** (1) the two new-sport spotlights get new Instagram rows and the outlines they replaced come back; (2) "Set up your school" moves to Sat 3 Apr 10:00 BST; (3) the 7 Apr children's-data LinkedIn post stays at 06:30 BST with a company-page reshare at 08:00 BST; (4) Gulf American-curriculum schools pick **United States** as their school system, and that wording stays; (5) next content: the Gulf flag football re-cut and the UK files; (6) next session: create the handles first, then discuss paid promotion.

- **2026-10-13:** ninth batch: founder answers applied, Gulf flag football, the whole UK leg written.
  - **India calendar:** new Instagram rows **Sun 21 Feb 19:00** (American football, "Two more sports, 1 of 2") and **Sun 28 Feb 19:00** (baseball & softball, 2 of 2), in the free Sunday-evening Reel slot three days after each how-to (the Sundays' 12:30 posts are consent-gated stories). Renamed with `git mv`: `2027-02-22-instagram-spotlight-american-football` → `2027-02-21-instagram-spotlight-american-football`, `2027-03-01-instagram-spotlight-baseball-softball` → `2027-02-28-instagram-spotlight-baseball-softball`; links and date mentions updated in the calendar and in six posts (29 Dec, 9 Jan, 14 Jan, 18 Feb, 25 Feb, 13 Mar). The outlines "Run a high jump with the O/X grid" (Mon 22 Feb) and "Livestream a college match with the overlay" (Mon 1 Mar) are restored and out of the backlog.
  - **International launch track:**
    - "Set up your school" moved from Sat 27 Mar 10:00 GST (07:00 GMT) to **Sat 3 Apr 10:00 BST** (13:00 GST, 14:30 IST), Short 18:00 BST; renamed `2027-03-27-youtube-howto-set-up-your-school` → `2027-04-03-youtube-howto-set-up-your-school` with the times inside updated; the 24 Mar Gulf post's pointer updated; the 31 Mar carousel is now row 5.
    - 7 Apr trust post: stays 09:30 GST / 06:30 BST, company-page reshare 08:00 BST, in the file and the row.
    - "United States" for Gulf American-curriculum schools recorded in the calendar gates, the 17 Mar post, the 3 Apr video and the 10 Apr Reel.
    - **10 new post files with full copy:** `2027-04-10-instagram-gulf-flag-football`, `2027-04-14-linkedin-uk-summer-term-sports-day-toolkit`, `2027-04-15-instagram-uk-year-groups-31-august`, `2027-04-17-youtube-howto-uk-sports-day-entries-to-champions` (full transcript, en-GB, + Short), `2027-04-21-linkedin-uk-accessibility-wcag`, `2027-04-22-instagram-uk-childrens-data`, `2027-04-24-instagram-uk-swimming-gala`, `2027-04-28-linkedin-uk-wednesday-leagues-term-fixtures`, `2027-04-29-instagram-uk-tennis-athletics-summer-term`, `2027-05-01-youtube-short-uk-record-board`.
    - **One new UK row:** Sat 24 Apr 18:00 BST swimming gala (UK edition of 8 Apr): swimming is a UK lead sport and that week had two rows. The UK leg is now Wed LinkedIn / Thu Instagram / Sat post for three weeks.
    - **One UK row changed:** Sat 1 May is now the record-board Short (18:00 BST, the Shorts slot) instead of "Long jump in feet and inches": UK school athletics is metric; feet and inches moved to the US "Later markets" row.
    - UK posts use houses, Year groups, sports day, fixtures, terms and half-term, BST with IST in brackets, the UK demo copy **SportnNote Demo Meet 2027 (UK)**, and keep every international gate. LinkedIn company-page reshares at 12:30 BST.
  - **Up next** section added (handles first, then paid promotion) with a draft handle checklist; the same note is in the calendar gates and the roadmap doc.
  - Totals: India calendar 209 rows (33 LinkedIn, 87 Instagram, 89 YouTube: 38 long, 51 Shorts), 124 copy-ready in 94 files; International launch track 18 rows, all copy-ready in 18 files (+ 6 later-market ideas); 112 post files in all.
