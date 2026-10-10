# docs/marketing: social content for LinkedIn, Instagram and YouTube

Ready-to-post drafts for SportnNote's social channels (@sportnnote, handles not created yet). The repo files are the source of truth. The Claude Doc "SportnNote social launch roadmap" (https://claude.ai/code/artifact/0ddd65b3-bb12-4401-8a6c-db30e8638b54) holds the strategy and a summary of this calendar.

**Nothing here has been posted.** Every file is a draft until the founder approves it.

## What's in the folder

| Path | What it is |
|---|---|
| `content-calendar.md` | Every planned post from 7 Dec 2026 to 14 Mar 2027: date, IST time, platform, format, title, pillar, status and a link to its file |
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
- **Every sport is equal.** 17 sports are live: cricket, football, hockey, basketball, volleyball, kabaddi, tennis, badminton, table tennis, squash, padel, pickleball, carrom, chess, golf, athletics (track and field) and swimming. Cricket is never the lead by default.
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
