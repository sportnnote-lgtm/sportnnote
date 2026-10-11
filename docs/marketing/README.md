# docs/marketing: social content for LinkedIn, Instagram and YouTube

Ready-to-post drafts for SportnNote's social channels (@sportnnote, handles not created yet). The repo files are the source of truth. The Claude Doc "SportnNote social launch roadmap" (https://claude.ai/code/artifact/0ddd65b3-bb12-4401-8a6c-db30e8638b54) holds the strategy and a summary of this calendar.

**Nothing here has been posted.** Every file is a draft until the founder approves it.

## What's in the folder

| Path | What it is |
|---|---|
| `content-calendar.md` | Every planned post from 7 Dec 2026 to 14 Mar 2027: date, IST time, platform, format, title, pillar, status and a link to its file. Then the Next season backlog and the International launch track (a proposal, not scheduled) |
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
- **Every sport is equal.** 27 sports are live: cricket, football, hockey, handball, basketball, volleyball, kabaddi, tennis, badminton, table tennis, squash, padel, pickleball, carrom, chess, golf, athletics (track and field, road, race walks, cross-country and combined events), swimming, weightlifting, shooting, archery, rowing, canoe sprint, cycling, netball, rugby (union and sevens) and ice hockey (the site's sport list in `scripts/build-website.mjs`, 12 Oct 2026). Baseball, softball and American football are being built: never announce or count them before they ship. Combined events (decathlon, heptathlon, school pentathlon and tetrathlon) are live since 11 Oct 2026 and can be announced, as part of athletics: they never add to the count. Cricket is never the lead by default.
- **Children's privacy:** describe how the app protects children today (guardian consent, initials for strangers, no direct messages to children, data export). Never imply a past exposure, never say "now" or "fixed", never claim legal compliance or certification.
- **Bug fixes aren't features.** Don't market a fix (e.g. SD-119, stat lines that named the wrong opponent) as new. At most one optional "your history is right" trust line.
- **One call to action per post.**

## Demo data for recordings
- **Account:** record only on a dedicated marketing demo account, with the tournament **SportnNote Demo Meet 2026** (Hyderabad).
  - Houses: **Red, Blue, Green and Yellow House**.
  - Players: fictional adults (e.g. Ravi, Arjun, Kabir, Dev, Veer, Rahul, Imran, Asha Rao, Priya, Meera).
  - No photos of real people.
- **Never record the dev seed's FIFA World Cup replay data:** it uses real footballers' names.
- **On screen:** a small "Demo data" label for the whole clip. Do Not Disturb on, and demo phone numbers only.

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
