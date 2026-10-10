# Every "End" asks first (scoring safety)

| Field | Value |
|---|---|
| Publish | Thu 21 Jan 2027, 19:00 IST |
| Platform / format | Instagram Reel, 15 s, 9:16 |
| Pillar | New feature (SD-106 match safety; built 11 Oct 2026, uncommitted at the time of writing) |
| Guide | https://sportnnote.in/guides/end-a-match-early/ (update the guide when SD-106 ships) |
| Status | Draft – **only if SD-106 is in the live build**; recheck the copy on screen |
| AI | None. Real screen recording, text and music. |

## Caption (post exactly)
```
Fat-finger proof. 👆🛡️

On a tight final, one wrong tap shouldn't end the match. So now:
• End match and Restart live in their own "Match controls" section at the very bottom of the Scoring tab, far from the scoring buttons
• Every one asks first: a red "Yes, end match" and a safe "No, keep scoring"
• The same goes for walkovers, cancelling a start and discarding unsynced taps

Built after a scorer told us how close they came. Keep the stories coming. 🙏

#SportnNote #ScorerLife #SchoolSports #LiveScore
```

## Hashtags
#SportnNote #ScorerLife #SchoolSports #LiveScore

## Alt text
A screen recording of a tennis match being scored. The scorer scrolls past the scoring buttons to a separate Match controls section at the bottom, taps End match, and a sheet asks "End this match?" with a red "Yes, end match" button and a "No, keep scoring" button. The scorer taps No and keeps scoring. Text reads: Every End asks first.

## Call to action
None beyond engagement ("keep the stories coming"). The bio link stays.

## Script

| Time | Screen (demo tennis match, set 2) | On-screen text |
|---|---|---|
| 0:00–0:03 | A thumb hovers over the scoring buttons mid-match: tense music. | One wrong tap… |
| 0:03–0:06 | Scroll down past the controls to the "Match controls" section at the very bottom. | …is now a long way away |
| 0:06–0:10 | Tap End match. The sheet "End this match?" with **Yes, end match** (red) and **No, keep scoring**. | Every End asks first |
| 0:10–0:13 | Tap **No, keep scoring**; back to scoring, score another point. | Phew. |
| 0:13–0:15 | End card. | Scorer-proof · SportnNote |

## Shot list and demo data
- **Match:** a demo tennis match, Asha Rao v Priya, Best of 3, mid set 2.
- **Optional extra clip:** the walkover confirmation "Walkover to Red House?" with **Yes, walkover to Red House** / **No, go back**.

## Pre-post checks
- **Build:** SD-106 is committed and in the live build. The section name ("Match controls") and button copy match the app exactly. Copy as of 11 Oct 2026, from src/core/matchSafety.ts:
  - "End this match?" / "Yes, end match" / "No, keep scoring";
  - "Restart this match?" / "Yes, restart match".
- **Founder:** OK to reference "a scorer told us" (true: the founder's report of 11 Oct 2026 about a tennis scorer). Don't name the scorer.
