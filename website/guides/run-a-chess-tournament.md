---
title: Run a chess tournament (Swiss or round-robin)
description: Set up a chess event, pair Swiss rounds with colours, record results, and read standings with Buchholz and FIDE tie-breaks.
category: Tournaments
audience: Organisers, Players, Parents & fans
sports: chess
order: 70
updated: 2026-10-11
---

Most school and open chess events are Swiss: nobody is knocked out, and each round pairs players on similar scores. Small events often play a round-robin. SportnNote runs both, scores 1, ½ and 0, and ranks the table with FIDE tie-breaks.

## Before you start
- You must be a host of the tournament.
- Create it from **Organize** → **🏆 New tournament**. Under **Contested by**, pick **👤 Individuals**, and under **Sports**, pick **♟️ Chess**.
- In **Add players**, tap **＋ New player**, type the name and a short code, then **Add & select**. Add them in seed order, strongest first.

## Step by step: choose the format
1. Open the tournament → **⚙ Manage** → **Chess — format & points**.
2. Under **Structure**, pick **🇨🇭 Swiss** and set the **Rounds**, or pick **🔁 League** for a round-robin.
3. Pick the **Time control** (it picks the rating list for seeding). Optionally set **Clock: minutes each** and **Clock: seconds added per move**.
4. For a Swiss, set the **Swiss bye**: **1** (the usual rule), **½** or **0**.
5. Under **Points system**, pick **FIDE Swiss** or **FIDE round robin**. To change the order, open **Tie-break order (advanced)**.
6. Tap **Save**.

> **Note:** A Swiss with no saved order gets the **FIDE Swiss** order when you create round 1.

## Step by step: draw the rounds
1. In **⚙ Manage**, tap **Auto-generate fixtures**.
2. Under **Format**, pick **🇨🇭 Swiss** or **🔁 Round-robin (league)**.
3. Tap **⚡ Generate preview**. Each Swiss game shows ♔ White first, then ♚ Black.
4. Tap **✅ Create** to schedule the games. Each game opens with its colours already set, and the **Round** screen opens with numbered boards to share or print.

Generate the next Swiss round once the current round has every result (a cancelled game doesn't hold it up). Withdrawals, absences, requested byes and late entries are set under **🧾 Who plays round N**: see [Run Swiss rounds](/guides/run-swiss-rounds-as-arbiter/).

## How the Swiss pairing works
- Round 1 follows your seed order, or [ratings](/guides/chess-ratings-and-crosstable/): the top half plays the bottom half (1 v 5, 2 v 6 … with 8 players). A coin toss gives the top seed's colour, and colours alternate down the boards.
- Later rounds pair players on the same score: the top half of each score group plays its bottom half. In an odd group, the lowest player moves down to the next group.
- Nobody plays the same opponent twice.
- Nobody gets one colour three times in a row, or more than two extra Whites (or Blacks). Otherwise colours alternate.
- If no rule-keeping pairing exists, the preview says so.

The screen says **In-app Swiss pairing — not FIDE-certified**: it follows the main ideas of FIDE's Dutch system, not every rule. For a rated event, use FIDE-endorsed software such as Swiss-Manager.

## Byes
With an odd number of players, the lowest-ranked player who has not had a bye (or a forfeit win) sits out.
- The bye points count as soon as the round is drawn, but it is not a game played.
- In tie-breaks it counts as a game against an imaginary opponent on your own score (FIDE 2023).

## Record results
Enter a whole round on the **Round** screen ([Run Swiss rounds](/guides/run-swiss-rounds-as-arbiter/)), or open each game from the **Matches** tab and record it White first ([How to record a chess game result](/guides/score-chess/)).

No-show? A host can tap **🏳 Award a walkover**, or record it with the **Forfeit** method: the full point, but not a game played. In a Swiss it counts in tie-breaks like a bye.

## Tie-breaks
Players level on points are split by the **FIDE Swiss** order, one tie-break after another:
1. **Buchholz Cut-1 (BH-C1)**: your opponents' scores added up, without the lowest.
2. **Buchholz (BH)**: the same, with nothing cut.
3. **Sonneborn-Berger (SB)**: the score of each opponent you beat, plus half of each one you drew with.
4. **Progressive score (PS)**: your running score after each round, added up.
5. **Direct encounter** between the tied players.
6. **Number of wins**, including forfeit wins and a full-point bye.
7. **Wins with Black (BWG)**.

This is FIDE's order for a Swiss where not everyone is rated. A round-robin keeps Sonneborn-Berger, wins, then direct encounter. **Median Buchholz** and **games with Black** are also under **Tie-break order (advanced)**.

## Read the standings
Open the tournament → **Stats** tab → **📊 Standings & leaders**. A Swiss shows one table called **Swiss**, with a column for each tie-break in use. Under it, the **♟️ Wall chart** shows each player's opponent, colour and result round by round, then any [category prizes](/guides/category-prizes-and-divisions/).

## Common questions

### Our rules give only half a point for a bye.
Set the **Swiss bye** to **½** in **Chess — format & points**.

### We run a knockout. What happens to a drawn game?
It carries on until there's a winner. In **Chess — format & points**, set **Knockout: games per match** (2 for a mini-match) and the rapid and blitz tie-break pairs. Still level: one Armageddon game, where a draw sends Black through.

### A team knockout match ended 2-2.
In the team match setup, pick **If a knockout match is level**: **Board count** (board 1 counts most) or **Drop the lowest board**. Still level: play a deciding game; the organiser records who goes through.

### Neither player turned up.
Record **0-0 Double forfeit**: 0 points each.
