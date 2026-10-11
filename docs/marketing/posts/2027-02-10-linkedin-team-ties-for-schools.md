# Inter-school team championships: one fixture, every rubber, the table done right

| Field | Value |
|---|---|
| Publish | Wed 10 Feb 2027, 09:30 IST |
| Platform / format | LinkedIn text post + 2 screenshots, company page |
| Pillar | New feature (team ties, SD-48; live since 11 Oct 2026) |
| Guide | https://sportnnote.in/guides/run-team-ties/ |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Real screenshots with demo data. |

"Racket and mind sports" week. Every Tue/Thu LinkedIn slot is taken, so this uses a Wednesday 09:30 slot, the week's third LinkedIn post (an exception, like launch week). It follows the YouTube how-to (Mon 8 Feb), the Instagram carousel and the founder's "Chess, carrom and table tennis deserve real tables too" (both Tue 9 Feb). Audience: PE heads, sports coordinators and the teachers who run inter-school and zonal team championships. **Fallback:** if the founder wants two LinkedIn posts a week only, fold the substance into the Tue 9 Feb founder post and drop this row.

## Post text (post exactly)
```
Ask anyone who has run an inter-school table tennis championship: the matches are the easy part.

A team fixture is five singles. Badminton team events are three singles and two doubles. A chess team match is four boards at once. Then someone has to work out who won the tie, stop it at the majority, and rank the group on rubbers and games when two schools finish level. Usually on paper, after the last match.

SportnNote now runs a team fixture as one tie:

• Pick the federation's format, or build your own. Table tennis World Team Champs (ABC v XYZ), Corbillon and Olympic. Badminton Thomas / Uber and Sudirman Cup. Tennis Davis Cup. Squash by order of merit. Chess on four or six boards, with half points.
• Both lineups are entered before play, and only hosts see them until both are in. Once a rubber starts, they lock.
• Each rubber is scored like any match. The tie score updates as rubbers finish.
• A tie stops at the majority (3 of 5, 2½ of 4), or plays the dead rubbers if your rules count them.
• The table counts each tie once, with the federation's own tie-breakers: rubbers, then games, then points.
• Parents and followers get one alert for the tie, not five.

It works for table tennis, badminton, tennis, squash, chess, carrom, padel and pickleball, in an inter-house group or a district knockout. Every rubber still goes on each student's profile as a singles or doubles match.

The step-by-step guide: https://sportnnote.in/guides/run-team-ties/

#SchoolSports #PhysicalEducation #TableTennis #Badminton #Chess
```

## Hashtags
#SchoolSports #PhysicalEducation #TableTennis #Badminton #Chess

## Images
1. The **tie page** of a demo table tennis tie: Red House 3–1 Blue House, five rubbers with players and scores, the fifth marked **Not played**.
   - **Alt text:** A SportnNote tie page for a table tennis team match between Red House and Blue House. Five singles rubbers are listed with their players and game scores. The tie stands at 3–1, and the fifth rubber is marked Not played.
2. A **group table** of four demo houses with the **R** column (rubbers won and lost) and the tie-break note.
   - **Alt text:** A group table for four teams in a table tennis team event. Each tie counts once. A column shows rubbers won and lost, and teams level on points are separated by rubbers and games.

## Call to action
Read the team-ties guide.

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026**, table tennis, the four houses (Red, Blue, Green, Yellow House) in a group generated with **👥 Each fixture is a team tie** → **World Team Champs · 5 singles (ABC v XYZ)**. Re-use the how-to's data (8 Feb).
- **Players:** fictional adults only. No real school names anywhere, even though the post talks about inter-school events.
- A small "Demo data" label on both screenshots.

## Pre-post checks
- **Build:** recheck in the frozen launch build: the preset names, **Not played**, the **R** column, the tie-break order for table tennis (guide: tie points 2/1, then results among the teams level, then rubbers, games and points ratios).
- **One tie alert:** needs the redeployed `notify-followers` edge function. If it isn't live, cut the "one alert for the tie" bullet.
- **"Students' profiles":** every rubber counts on players' profiles (guide). Minors appear only as demo data; real school use needs the usual consents.
- **No competitor names.** Federation names are used only to name formats.
