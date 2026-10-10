---
title: Run a chess tournament (Swiss or round-robin)
description: Set up a chess event, draw Swiss or round-robin rounds, record results, and read standings that count byes and forfeits the FIDE way.
category: Tournaments
audience: Organisers, Players, Parents & fans
sports: chess
order: 70
updated: 2026-10-10
---

Most school and open chess events are Swiss: everyone plays every round, nobody is knocked out, and each round pairs players on similar scores. Small events often play a round-robin, where everyone meets everyone. SportnNote runs both. It scores 1 for a win, ½ for a draw and 0 for a loss, and ranks the table for you.

## Before you start
- You must be a host of the tournament.
- Create it from **Organize** → **🏆 New tournament**. Under **Contested by**, pick **👤 Individuals**, and under **Sports**, pick **♟️ Chess**.
- Add the players from the tournament's first step, **Add players**: tap **＋ New player**, type the name and a short code, then **Add & select**. Add them in seed order, strongest first.

## Step by step: choose the format
1. Open the tournament → **⚙ Manage** → **Chess — format & points**. (While creating the tournament, the same screen is **⚙️ ♟️ Chess settings ›**.)
2. Under **Structure**, pick **🇨🇭 Swiss** and set the number of **Rounds**, or pick **🔁 League** for a round-robin.
3. Pick the **Time control**. It is for the record only; the clock is on the board.
4. For a Swiss, set the **Swiss bye**: **1** (the usual rule), **½** or **0**.
5. Choose what to **Break ties first by**: **Sonneborn-Berger**, **number of wins** or **head-to-head**.
6. Tap **Save**.

> **Note:** The **Swiss bye** row only shows once the structure is Swiss.

## Step by step: draw the rounds
1. In **⚙ Manage**, tap **Auto-generate fixtures**.
2. Under **Format**, pick **🇨🇭 Swiss** or **🔁 Round-robin (league)**.
3. Tap **⚡ Generate preview**. Check the pairings and the start times.
4. Tap **✅ Create** to schedule the games.

For a Swiss, round 1 pairs the top half against the bottom half. Come back after every game in the round has a result, and generate the next round. It pairs players on similar scores and avoids rematches. The app's Swiss pairing is a simple score-based pairing. It is not FIDE-certified, so use certified pairing software for a rated event.

## Byes
With an odd number of players, one player sits out each Swiss round. In round 1 that is the middle seed. After that, it is the lowest-ranked player who has not had a bye yet. Nobody gets two byes while someone else has none. The preview names the player under the match count, for example "Bye this round: Arjun Erigaisi — 1 point in the standings (not a game played)."

A bye counts the way FIDE counts it:
- The player gets the bye points (1 unless you chose ½ or 0) as soon as the round is drawn.
- It is not a game played. It does not add to **P**, **W**, **D** or **L**.
- It does not add to Sonneborn-Berger, because there was no opponent.
- The table shows it on a second line, for example "1 bye".

## Step by step: record a result
1. Open the game from the tournament's **Matches** tab.
2. Under **♔ White pieces**, tap the player who had White.
3. Under **Result**, tap who won, or **Draw**.
4. Optionally pick **How (optional)**, such as **Checkmate**, **Resignation**, **On time** or **Draw agreed**, and type the number of moves.
5. Tap **✓ Record result**.

If a player doesn't turn up, a host can tap **🏳 Award a walkover** before the game starts. You can also record the result with the **Forfeit** method.

## Forfeits
A forfeit win scores the full point, but it is not a game played:
- It is left out of **P**, **W**, **D** and **L**, and the table says "1 won by forfeit" or "1 lost by forfeit" instead.
- It is left out of Sonneborn-Berger.
- It still counts for **number of wins**, because FIDE counts rounds won with or without playing.

## Read the standings
Open the tournament → **Stats** tab → **📊 Standings & leaders**. A Swiss event shows one table called **Swiss**. Under it, "Not games played (the points count)" lists every bye and forfeit. See [Read the points table and adjust points](/guides/points-table-and-adjustments/) for the columns and for adjusting points by hand.

## Common questions

### A player had a bye, and now they lead the table. Is that right?
Yes. A bye is worth 1 point by default, the same as a win. Older Swiss events that never recorded the point now show it.

### Our rules give only half a point for a bye.
Open **Chess — format & points** and set the **Swiss bye** to **½**. The table updates straight away, including earlier rounds.

### Does a round-robin change?
No. Without byes or forfeits, a round-robin table is the same as before.
