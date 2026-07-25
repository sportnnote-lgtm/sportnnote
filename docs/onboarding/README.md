# Sportfolio onboarding content

New-user content in two formats, from one source of truth:

- **Video scripts** (`scripts/`) — production-ready scripts for a YouTube
  onboarding series. Each is shot-by-shot (visual + voiceover) so it can be
  recorded from a screen capture of the app with a voiceover, or handed to an
  editor.
- **Articles** (`articles/`) — long-form written guides for a docs/blog page and
  YouTube descriptions. Fuller than the built-in knowledge-base stubs.

> **In-app note:** the app itself renders the long-form guides from
> `src/data/supportGuides.ts` (the canonical *in-app* copy, keyed by KB id and
> shown via the Help centre's "📖 Read the full guide" reveal). The `articles/`
> markdown here is the *publishing* copy of the same content. When you change one,
> update the other.

Everything maps back to the knowledge base (`src/data/supportKB.ts`) so the app,
the articles, and the videos stay consistent — same vocabulary (organizer/scorer,
match, tournament, fixtures, squad), same steps.

## Where each piece is published

| Format | Home | Also |
|---|---|---|
| KB article (short) | In-app Help centre (search + browse) — **live now** | — |
| Long-form article | Help centre "read more" / docs page | Blog |
| Video | Embedded in the matching Help article (once the video layer ships) | **YouTube channel** |

## House style

- **Voice:** friendly, direct, second person ("you"). We build for the
  **organizer/scorer** first — the person running the game.
- **Length:** videos **60–120s** for how-tos, up to ~3 min for the tournament
  walkthrough. Articles: skimmable, task-shaped, headings + numbered steps.
- **Accuracy:** every step must match the real app. When a feature isn't built
  yet, say so or leave it out — don't script a screen that doesn't exist.
- **No jargon in titles.** "Score your first match", not "Live scoring engine".
- **Evergreen:** placeholder team names (Red House / Blue House), no dates, no
  prices — so content doesn't go stale.

## Series plan (episodes)

Ordered by the new-user journey. Status: ✅ drafted · ⬜ planned.

| # | Title | ~Len | KB article | Script | Article |
|---|-------|------|-----------|--------|---------|
| 1 | What is Sportfolio? | 60s | `what-is-sportfolio` | ✅ `scripts/01-what-is-sportfolio.md` | ✅ `articles/getting-started.md` |
| 2 | Score your first match | 90s | `score-first-match` | ✅ `scripts/02-score-your-first-match.md` | ✅ `articles/getting-started.md` |
| 3 | Fix a mistake & score offline | 75s | `undo-fix-mistake`, `offline-scoring` | ✅ `scripts/03-undo-and-offline.md` | ✅ `articles/live-scoring.md` |
| 4 | Run a tournament, start to finish | 3 min | `create-tournament`, `generate-fixtures`, `standings` | ✅ `scripts/04-run-a-tournament.md` | ✅ `articles/running-a-tournament.md` |
| 5 | Set the playing XI / squad | 60s | `set-lineup-squad`, `add-players` | ✅ `scripts/05-set-the-squad.md` | ✅ `articles/live-scoring.md` + `articles/teams-and-players.md` |
| 6 | Choose a format (T20, 5-a-side, 3×3…) | 75s | `choose-format` | ✅ `scripts/06-choose-a-format.md` | ✅ `articles/live-scoring.md` |
| 7 | Follow players & get match reminders | 60s | `follow-players`, `match-reminders` | ✅ `scripts/07-follow-and-reminders.md` | ✅ `articles/following-and-alerts.md` |
| 8 | Find teams & players on Discover | 60s | `join-team-code` + Connect board | ✅ `scripts/08-discover.md` | ✅ `articles/teams-and-players.md` |
| 9 | Your profile, stats & verification | 75s | `edit-profile`, `verification` | ✅ `scripts/09-profile-stats-verification.md` | ✅ `articles/account-and-profile.md` |

_Video scripts: **9/9 drafted.** Long-form articles: **all 18 KB topics covered**
across 6 category guides (`getting-started`, `live-scoring`, `running-a-tournament`,
`teams-and-players`, `following-and-alerts`, `account-and-profile`)._

### Article → KB-topic coverage map

| Article | KB topics covered |
|---|---|
| `getting-started.md` | `what-is-sportfolio`, `score-first-match`, `friendly-match` |
| `live-scoring.md` | `set-lineup-squad`, `choose-format`, `undo-fix-mistake`, `offline-scoring`, `rain-dls` |
| `running-a-tournament.md` | `create-tournament`, `generate-fixtures`, `standings` |
| `teams-and-players.md` | `add-players`, `join-team-code` |
| `following-and-alerts.md` | `follow-players`, `match-reminders` |
| `account-and-profile.md` | `edit-profile`, `verification`, `change-timezone` |

All 18 knowledge-base ids in `src/data/supportKB.ts` map to a long-form section.

## Production checklist (per video)

- [ ] Record app screen capture at mobile aspect (or the web demo on a phone frame)
- [ ] Voiceover from the script's VO column
- [ ] Title + description + thumbnail (from the script header)
- [ ] Captions (accessibility — pull from the VO text)
- [ ] Publish to YouTube; grab the URL
- [ ] Add the URL to the matching KB article once the in-app video layer ships
