---
title: Chess ratings, seeding and the wall chart
description: Add FIDE ID and ratings to a chess profile, seed Swiss round 1 by rating, and read the wall chart with ARO and performance rating.
category: Tournaments
audience: Organisers, Players, Parents & fans
sports: chess
order: 71
updated: 2026-10-11
---

A chess event needs three things from ratings. Round 1 is seeded by rating. The wall chart shows who played whom, with which colour and what result. Each player's performance rating says how well they played against the field. SportnNote does all three from ratings that players, or the organiser, type in.

> **Important:** The app does not look anything up on the FIDE website, and nothing here is a FIDE-rated result. ARO and performance ratings are unofficial.

## Before you start
- To add your own ratings, you need a player profile with **♟️ Chess** among your sports.
- An organiser can add ratings for players they created who haven't joined yet.
- To seed by rating or read the wall chart, the event must be a chess tournament. See [Run a chess tournament](/guides/run-a-chess-tournament/).

## Step by step: add ratings to a profile
1. Open your profile and tap **✎ Edit profile**. An organiser opens the player → **♟️ Chess** → **Details** → **Edit ›**.
2. In the **♟️ Chess** card, find **Ratings**.
3. Type the **FIDE ID** (4 to 10 digits) and any of **Standard rating**, **Rapid rating** and **Blitz rating** (100 to 3500). Leave the others blank.
4. Tap **Save profile** (or **Save details**).

The chess page of the profile shows them, for example "Standard 1850 · Rapid 1790 · FIDE ID 46616543". A value in the wrong shape is marked in red and isn't saved.

## Step by step: seed Swiss round 1 by rating
1. Set the event's **Time control** in **⚙ Manage** → **Chess — format & points**. It picks the rating list: classical and untimed use **Standard**, rapid uses **Rapid**, and blitz and bullet use **Blitz**.
2. In **⚙ Manage**, tap **Auto-generate fixtures** and pick **🇨🇭 Swiss**.
3. Tap **Seed by standard rating** (or rapid / blitz). The seed list appears under it, for example "1. Aarav 1850 · 2. Diya 1720 · 3. Ishaan (unrated)".
4. Tap **⚡ Generate preview**, then **✅ Create**.

The order is highest rating first, then players with no rating on that list, then by name, as in FIDE's Swiss rules (C.04.2). The choice is saved, so later rounds keep the same pairing numbers. **Seed: order picked** keeps the order you selected players in.

## Read the wall chart
Open the tournament → **Stats** tab. Under the Swiss table there is a **♟️ Wall chart**. A round-robin shows a **♟️ Crosstable**.
- Each Swiss row is a player, by rank, and each column a round. `4w1` means "against number 4, with White, won", `2b½` a draw with Black, and `6b0` a loss with Black.
- `3+` is a forfeit win, `3−` a forfeit loss. A double forfeit (neither player came) shows `−` on both rows.
- `bye` is a bye, `–` a round the player missed, and `…` a game still to be played.
- After the rounds come **Pts** and the tie-break columns in use, such as **BH-C1**, **BH**, **SB** and **PS**.
- When anyone has a rating on the event's list, **Rtg**, **ARO** and **TPR*** appear.

On a phone the names stay in place and the grid scrolls sideways. Tap a player to see their tournament line, for example "R1 4w1 · R2 2b½ · R3 1w1 — 2½ pts · ARO 1800 · TPR 2073". Tap **Open profile ›** to go to the player.

A round-robin crosstable has one column per opponent, by rank. Each cell is the row player's result against that opponent: 1, ½, 0, + or −.

## How ARO and TPR are worked out
- **ARO** (average rating of opponents) is the average rating of the opponents the player actually played, rounded to the nearest whole number.
- Byes, forfeits and double forfeits are left out, and so are opponents with no rating on the event's list.
- **TPR** (performance rating) is ARO plus a number from FIDE's conversion table. That number depends on the score in those games. 50% adds 0, 75% adds 193, 100% adds 800, and 0% takes away 800.
- These follow FIDE's tie-break rules (C.07) and rating regulations (B.02). The figures use whatever ratings players typed in, so they are only as accurate as those.

## Common questions
### A player's rating changed during the event. What happens?
The wall chart uses the rating on the profile now. Ask players to update ratings before round 1.

### Can ARO be a tie-break?
Not yet. Tie-breaks stay as set in **Tie-break order (advanced)**.

### A player plays rapid and standard. Which rating is used?
Only the list that matches the event's time control. A rapid event never uses a standard rating.
