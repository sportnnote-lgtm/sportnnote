---
title: Import your fixtures from Excel or Google Sheets
description: Paste your match schedule from a spreadsheet or upload a CSV, check every row for problems, fix team names, and create all the matches in one go.
category: Tournaments
audience: Organisers
sports: all
order: 40
updated: 2026-10-09
---

Many organisers already have the fixture list in a spreadsheet: dates, times, teams and grounds. Typing 40 matches into the app one by one takes an evening. With **Import schedule**, you paste the rows from Excel or Google Sheets, or upload a CSV file. Then you check each row and create every match at once.

## Before you start
- You must be a host of the tournament.
- Add the teams to the tournament first. Team names in your sheet must match the teams in SportnNote. See [Add teams to a tournament](/guides/teams-join-a-tournament/).
- Uploading a CSV file works in the web app. On a phone, paste the rows instead.

## The columns
Use one row per match. The template has these columns, in this order:
- `date`: day first, like `12/10/2026`
- `time`: like `4:30 pm` or `16:30`
- `home_team` and `away_team`: the team names
- `venue`: the ground (optional)
- `group`: for example `A` (optional)
- `stage`: for example `Group`, `Semi final` or `Final` (optional)
- `sport`: needed on every row only if the tournament has more than one sport

Extra columns are ignored, and the screen lists them so you know. If your rows have no header line, the columns are read in the order above.

## Step by step
1. Open the tournament → **⚙ Manage** → **Import schedule (spreadsheet)**.
2. Under **1 · Get the template**, tap **⬇ Download template (CSV)** if you want a ready-made file. The tournament's team names are listed below it, so you can copy them exactly.
3. Under **2 · Add your matches**, select the rows in Excel or Google Sheets (with the header row), copy them, and paste them into the box. In the web app, you can instead tap **📂 Choose CSV file** and pick your file.
4. Under **3 · Check and create**, look at the summary. It shows how many rows are **ready**, how many have something **to check**, and how many **won't import**.
5. Tap **Problems** to see only the rows that need attention, and fix them (see below).
6. Tap **Create** at the bottom. The button shows how many matches will be made. Rows that won't import are left out.

Each row shows **✓ Created** as it's saved. When it's done, you'll see "Schedule imported" with the number of matches added, and you go back to the tournament.

> **Tip:** Next, give the new matches scorers in one go from **⚙ Manage** → **Scorers & officials** → **🎯 Assign scorers to fixtures**. See [Scorers and officials](/guides/scorers-and-officials/).

## Fixing rows
Rows with a red ✕ won't import. Rows with an amber ⚠ will import, but check them first. Common messages:
- "did you mean Red House? Will import as Red House.": a team name is close to one of your teams. Even if you don't tap anything, the row imports with Red House, and the summary above the rows counts how many rows will import with a suggested name. Tap the "Use Red House" chip to confirm it, or skip the row if the guess is wrong.
- "No team called … add it under Participating teams first": the team isn't in SportnNote. Tap **Add teams to the tournament →**, add it, then come back.
- "isn't in this tournament yet — will be added": the team exists but isn't entered. It will be added when you create.
- "Can't read the date" or "Can't read the time": use `12/10/2026` and `4:30 pm`.
- "is outside the tournament": the date falls outside the tournament's start and end dates.
- "No time — set to 9:00 am": the match will start at 9 am unless you add a time.
- "Clash": the ground is already booked, or a team is already playing at that time.
- "already scheduled" or "Same fixture as row": the same two teams are already playing that day.

To fix a cell, edit it in the pasted text, or fix your spreadsheet and paste again. To leave a row out, tap the **✕** at its top right. Tap **Restore** to bring it back.

## Common questions

### Can I import twice?
Yes. Rows already in the tournament are flagged as "already scheduled", so you can skip them and avoid duplicates.

### Why is my date wrong by a month?
Dates are read day first. `03/04/2026` means 3 April 2026, not 4 March. Check the summary rows before you create.

### A row failed to save. What now?
Importing stops at that row and tells you which one failed, for example "Created 12 of 30. Row #13 failed". The rows already saved show **✓ Created**. Check your connection, then tap **Create** again. Rows already created are skipped, so nothing is made twice.

### Will the venues match my grounds?
Yes. If a venue in your sheet matches one of the tournament's grounds, the tournament's spelling is used.
