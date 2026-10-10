# Match-day mistakes happen. Losing the goal shouldn't.

| Field | Value |
|---|---|
| Publish | Thu 21 Jan 2027, 09:30 IST |
| Platform / format | LinkedIn text post + 2 screenshots, company page |
| Pillar | New feature (SD-114 live-scoring corrections for football, hockey, basketball and kabaddi; live since 11 Oct 2026) |
| Guide | https://sportnnote.in/guides/score-football/ (also /score-hockey/, /score-basketball/, /score-kabaddi/) |
| Status | Draft – copy ready (awaiting founder approval) |
| AI | None. Real screenshots with demo data. |

Same day as the Instagram Reel "Every End asks first" (19:00). This post is the "fix anything" week's LinkedIn angle: corrections that can't lose what you were correcting.

## Post text (post exactly)
```
Every scorer at a school match makes mistakes. A goal tapped for the wrong player. A raid entered a minute late. A yellow card on the wrong shirt number.

Fixing it should never cost you the thing you were fixing.

What SportnNote now does in football, hockey, basketball and kabaddi:

• A goal is on the board the moment you tap the scorer. The assist is optional, and closing the box keeps the goal.
• Removing a moment asks first and says what goes with it: the assist, the keeper's save in hockey, a kabaddi raid's tackle and all-out points.
• Start editing a moment, change your mind, tap Cancel: the original stays exactly where it was.
• Missed something? Backfill it at the right minute. A bar at the top reads "Backfilling at 12′" until you tap Back to live, so your next live tap isn't stamped in the past.
• In kabaddi, you can't mark more defenders touched than there are on the mat.

Built for a PE teacher scoring on a phone at the touchline, with the whole school following the live score.

Football scoring, step by step: https://sportnnote.in/guides/score-football/

#SchoolSports #PhysicalEducation #SportsEducation
```

## Hashtags
#SchoolSports #PhysicalEducation #SportsEducation

## Images
1. Football, the assist step straight after a goal: the panel "⚽ Goal — Arjun" with "✓ Goal recorded (2-1). Assist? (optional — pick one, or Close)" and the squad chips.
   - **Alt text:** SportnNote's football scoring screen just after a goal. The panel says the goal is recorded at 2-1 and asks for an optional assist, with a Close option.
2. Kabaddi, the remove check sheet after tapping ✕ on a raid: the sheet lists what goes with it ("Raid +2, Tackle +1, All out +2"), with **No, keep it** and **Yes, remove**.
   - **Alt text:** A kabaddi timeline correction. A check sheet asks before removing a raid and lists the raid, tackle and all-out points that will go with it, with buttons No, keep it and Yes, remove.

## Call to action
Read the football guide.

## Shot list and demo data
- **Account:** the marketing demo account, tournament **SportnNote Demo Meet 2026**.
- **Football:** Red House v Blue House, 2-1 in the second half. Score the goal via **Goal — Red House** → Arjun and screenshot the assist step before tapping anything.
- **Kabaddi:** Green House v Yellow House. Pre-score a raid with 2 touches that triggered an all out, then a tackle, so the remove sheet lists all three. Open **✕** on that raid and screenshot the sheet.
- **Players:** fictional adult demo players only (Arjun, Ravi, Kabir, Dev, Veer). No photos.
- A small "Demo data" label on both screenshots.

## Pre-post checks
- **Build:** SD-114 shipped on 11 Oct 2026. Recheck in the frozen launch build: "✓ Goal recorded (…). Assist? (optional — pick one, or Close)", "⏪ Backfilling at …", "▶ Back to live", **Yes, remove** / **No, keep it**, and "· N on the mat" on the kabaddi touch chips.
- **Hockey "keeper's save" line:** confirm the hockey remove sheet names the save in the frozen build; if not, cut "the keeper's save in hockey".
- Don't mention the old double-counted-goal bug: this post is about how corrections work, not about what was broken.
