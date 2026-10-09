/**
 * Support guides — the long-form, in-app companion to the KB stubs.
 *
 * `data/supportKB.ts` holds the SHORT answer shown first (summary + a few-line
 * body). This module holds the fuller "read the full guide" content the Help
 * centre reveals on demand — the same guides published as markdown under
 * `docs/onboarding/articles/` (that copy is for the blog / YouTube descriptions;
 * THIS is the canonical in-app copy). Keyed by the same article id, so a KB
 * article and its guide never drift apart.
 *
 * Content uses the small markdown subset that `components/Markdown.tsx` renders:
 * `##`/`###` headings, `-` bullets, `1.` numbered steps, and `**bold**`. No
 * tables, no links — keep it task-shaped and in the app's vocabulary.
 *
 * Not every article needs a guide; `getGuide()` returns undefined when there's
 * nothing more to say than the stub already covers.
 */

export const GUIDES: Record<string, string> = {
  'what-is-sportfolio': `SportnNote lets anyone score a match live and share it — like CricHeroes, but for **every sport** (football, cricket, basketball, kabaddi, tennis, badminton, volleyball and more).

## What you can do
- **Score a match** ball-by-ball or point-by-point, live, even offline.
- **Run a tournament** — add teams, generate fixtures, track standings.
- **Follow players and teams** and get alerts when they're playing.

The person we build for first is the **organizer/scorer** — whoever's running the game. Everything is designed to be fast to tap while a match is happening.

## Demo mode
If the app is in demo mode it's running on local sample data so you can explore every screen offline — tap any match to open the live scorer. Nothing you do in demo affects real data.`,

  'score-first-match': `Scoring works the same for every sport: **start → tap as it happens → fix if needed → done.**

## Steps
1. Open a match from **Home** — any card marked "tap to score" is ready — or create one.
2. On the **Scoring** tab, tap **▶ Start the match** to begin the clock or innings.
3. Tap the scoring controls as play happens. They're tailored to each sport — goals, runs, points, raids.
4. If prompted, pick the player involved — that's how individual stats build up.
5. Made a mistake? Tap **↶ Undo** to step back one action; tap again to keep rewinding.

Your taps are saved on the device instantly, so you never lose scoring even if the connection drops. There's nothing to set up first.`,

  'friendly-match': `A **friendly** is a one-off match that isn't part of a tournament.

## Set one up
1. Tap the **🤝** (handshake) button in the Home header.
2. Pick the sport and the two teams — or create them on the spot.
3. Choose the format, then schedule it or start scoring right away.

Friendlies show up in your matches and count toward players' **friendly** stats, kept separate from official tournament stats — so a player's tournament record stays clean.`,

  'offline-scoring': `Matches happen on grounds with patchy signal. SportnNote is built for that.

## How it works
- Every tap is saved **on the device immediately** — you can score a whole match in airplane mode.
- Offline, a banner shows how many changes are saved locally. Keep scoring — nothing is lost.
- When you're back online (and signed in on a live account), your scoring syncs up automatically. Nothing to press.
- Close the app mid-match by accident? Reopen it and the match is exactly where you left off.

## If sync keeps failing
If the banner says "Can't sync right now" (you're online, but sync keeps failing), your scoring is still safe on the device. Tap **Retry**. If it keeps failing, contact support and mention the match.

In demo mode there's no cloud sync — everything stays on the device, which is why you can explore fully offline.`,

  'undo-fix-mistake': `Everyone mis-taps. Every scoring action can be reversed.

## Undo
- Tap **↶ Undo** to reverse the last action. Tap again to keep stepping back through the history — score, wicket, card, substitution, whatever it was.
- Undo restores the exact previous state, including the clock/innings and any player stats that action credited, so match and player records stay consistent.
- There's no penalty and nothing to confirm — undo freely while you find the right entry.

For some sports you can also edit a recorded moment in place from the match timeline.`,

  'set-lineup-squad': `Before a match, tell SportnNote who's actually playing so stats attach to the right people.

## Pick the lineup
1. Open the match and go to the **Squad / Lineup** step (shown before you start, and reachable from the match menu).
2. For each team, tap players to move them between **Starting** and **Bench**. A counter shows how many you've picked versus how many the format needs.
3. Use **Fill starters** to auto-complete the starters, or **Copy last match's squad** to reuse this team's previous side.
4. Missing a player? Tap **+ Add / invite a player** to add them without leaving the screen.

You can start scoring without a full lineup and add players later, but setting it up front means you can pick the scorer or goal-scorer straight from the list.`,

  'choose-format': `The **format** sets the rules — how many players a side, how long, how many overs or periods — so scoring behaves correctly.

## Pick a preset
When you create a match or tournament, pick a preset for the sport:
- **Cricket:** T20, ODI, T10, The Hundred, Sixes, Box, Test
- **Football:** 11-a-side, 7s, 5-a-side turf, Futsal
- **Basketball:** 5v5, 3×3, 2v2, 1v1
- …and equivalents for the other sports.

Picking a preset sets all the underlying rules at once.

## Customize
Tap **⚙ Customize this format** to set individual rules yourself — players per side, overs, periods, and sport-specific options (for example, box cricket lets you set any number of players and choose tennis or leather ball).

If a format or street-rule variant you need isn't offered, tell us from **Settings → Help & support** — we track those requests.`,

  'rain-dls': `When weather or time cuts a limited-overs cricket match short, or the teams agree a different length:

## Change the overs
1. In the live scorer, tap **⏱ Overs & target**.
2. Pick **Change overs** and set the new total (up or down, in either innings). The target doesn't move.

## Rain (DLS)
1. With DLS switched on for the match, pick **☔ Rain (DLS)** and enter the new total overs.
2. The preview shows the overs lost and the **revised target** before you apply — no manual maths at the ground.
3. Repeat for each further interruption. The scoreboard shows "Target 113 (DLS)" and the result says "(DLS)".

## Set a target by hand
In the chase, pick **Set target** and type the runs and overs from the official sheet. Built-in DLS is then switched off for the rest of the match.

DLS uses the ICC Standard Edition resource values (6-ball overs, so The Hundred counts as 16.4 overs).`,

  'create-tournament': `Run a whole competition from the **Organize** tab.

## Steps
1. Go to **Organize** and create a new tournament — name, sports, dates.
2. Add the teams taking part.
3. Generate fixtures (see the fixtures guide) — round-robin or knockout.
4. Score each match as it's played; standings update automatically.

A tournament can span multiple sports — add each sport and manage its teams, fixtures and standings separately under the one event.`,

  'generate-fixtures': `Once a tournament has its teams, open **Generate fixtures** to build the schedule automatically.

## Formats
- **Round-robin:** everyone plays everyone once — or twice, for home & away.
- **Knockout:** a single-elimination bracket, with byes handled automatically when the number of teams is odd.

## Deciding level matches
For knockouts you can set how a tied match is decided — for example extra time then penalties, penalties straight away, or a draw stands — and it's applied to every generated match.`,

  standings: `Each tournament has its own standings table and stat leaders, scoped to that tournament only.

## Where to look
1. Open the tournament, then its sport section.
2. See the **table** (points, wins, draws, losses, difference) and the **stat leaders** (top scorers and more).
3. Standings update automatically as you score matches — top places carry medal highlights.

If a table looks wrong, check you're viewing the right tournament and that the finished matches were fully scored to the end.`,

  'add-players': `A team's roster is the pool you pick each match's lineup from.

## Add a player
1. Open the team: **Organize → Teams** (a team you just created opens here automatically), the team's page → **Squad · ＋ Add players**, or a match's **Info → Matchday squads → ＋ Add players to this team**.
2. In **Mobile number, name or email**: type a name to find someone already on SportnNote, or enter their mobile number — or tap **📇 Choose from contacts** (Android) / **📋 Paste number** (iPhone).
3. Already on SportnNote → tap **＋ Add**. New number → **＋ Add & invite**: they're added as "invited" and WhatsApp opens with an invite. Their name and jersey number are optional.

A player is identified by their **phone number**, so the same number is always the same person across teams and tournaments. If they're not on SportnNote yet, adding them creates an invited entry you can score against immediately; they can claim it later by signing up with that number.`,

  'join-team-code': `If someone runs a team and wants you on the roster, they can share an **invite code**.

## Join
1. Go to **Settings → Join a team with a code**.
2. Enter the code you were given.
3. You're added to that team — their matches and this team now show up for you.

You can also open an invite link directly, which fills the code in for you. Invite codes are the quickest way to bring a known group together without searching for each person.`,

  'follow-players': `Following keeps the people and teams you care about in front of you.

## Follow
1. Open any **player** or **team** profile — or find them on the **Discover** tab.
2. Tap **+ Follow**. It becomes **✓ Following**.
3. Their live and upcoming matches now appear in your **Home** feed, and you can get reminders before they play.

Manage everyone you follow from **Settings → Following**. Tap **✓ Following** again to unfollow at any time.`,

  'match-reminders': `Get a nudge before a match starts so you never miss kickoff.

## Set reminders
1. Go to **Settings → Match reminders**.
2. Choose one or more lead times — **1 day**, **1 hour**, **15 minutes** before the match.
3. The summary line shows what's set.

Reminders cover matches you're **playing in** and matches for **anyone you follow**. Want quiet? Clear every lead time and reminders switch **off**.

Reminders rely on notifications being allowed for SportnNote on your device. If you're not getting them, check your phone's notification settings for the app.`,

  'change-timezone': `All match times display in your chosen time zone (default India / IST), so kickoffs and reminders line up with your clock.

## Change it
1. Go to **Settings → Time zone**.
2. Pick your time zone from the inline list.

Set this if you travel or if your matches are in a different region — a match abroad then shows in your local time, and reminders fire at the right moment.`,

  verification: `Verification confirms a player's date of birth — and, for under-18s, their parent/guardian — using a proof ID.

## Get verified
1. On your profile, open **🛡️ Age & guardian verification**.
2. Upload a proof of age — birth certificate, school ID, or passport.
3. The status changes to **⏳ Pending review** while our support team checks it.
4. Under-18 players confirm a parent or guardian here as well.
5. Once approved, your status shows **☑️ Verified** with a tick beside your name.

**Your privacy:** the document is only ever seen by the support team for review — it is **never** shown on your public profile.`,

  'edit-profile': `Your profile is your sporting CV — every match, win and per-sport stat in one place. Keep it current so teammates and organizers can find you.

## Edit your details
1. On your profile, tap **✎ Edit profile** (or tap your profile photo).
2. Update your name, city, jersey number, photo, and the sports you play.
3. Save — changes show immediately.

## Your stats
- Use the **All / Official / Friendly** chips to switch scope.
- The **By sport** section breaks your record down; tap a sport for its detailed history, where **wins carry a green edge and a "WON" tag**.`,
};

/** The long-form guide for an article, if one exists. */
export const getGuide = (id: string): string | undefined => GUIDES[id];

/** Whether an article has a "read the full guide" companion. */
export const hasGuide = (id: string): boolean => id in GUIDES;
