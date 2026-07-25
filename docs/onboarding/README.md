# Sportfolio onboarding content

New-user content in two formats, from one source of truth:

- **Video scripts** (`scripts/`) — production-ready scripts for a YouTube
  onboarding series. Each is shot-by-shot (visual + voiceover) so it can be
  recorded from a screen capture of the app with a voiceover, or handed to an
  editor.
- **Articles** (`articles/`) — long-form written guides for the in-app Help
  centre and a docs/blog page. Fuller than the built-in knowledge-base stubs.

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
| 1 | What is Sportfolio? | 60s | `what-is-sportfolio` | ✅ `scripts/01-what-is-sportfolio.md` | ⬜ |
| 2 | Score your first match | 90s | `score-first-match` | ✅ `scripts/02-score-your-first-match.md` | ⬜ |
| 3 | Fix a mistake & score offline | 75s | `undo-fix-mistake`, `offline-scoring` | ✅ `scripts/03-undo-and-offline.md` | ⬜ |
| 4 | Run a tournament, start to finish | 3 min | `create-tournament`, `generate-fixtures`, `standings` | ✅ `scripts/04-run-a-tournament.md` | ✅ `articles/running-a-tournament.md` |
| 5 | Set the playing XI / squad | 60s | `set-lineup-squad`, `add-players` | ✅ `scripts/05-set-the-squad.md` | ⬜ |
| 6 | Choose a format (T20, 5-a-side, 3×3…) | 75s | `choose-format` | ✅ `scripts/06-choose-a-format.md` | ⬜ |
| 7 | Follow players & get match reminders | 60s | `follow-players`, `match-reminders` | ✅ `scripts/07-follow-and-reminders.md` | ⬜ |
| 8 | Find teams & players on Discover | 60s | `join-team-code` + Connect board | ✅ `scripts/08-discover.md` | ⬜ |
| 9 | Your profile, stats & verification | 75s | `edit-profile`, `verification` | ✅ `scripts/09-profile-stats-verification.md` | ⬜ |

_Video scripts: **9/9 drafted.** Next: expand the 18 knowledge-base stubs into
full Help-centre articles (see `articles/`)._

## Production checklist (per video)

- [ ] Record app screen capture at mobile aspect (or the web demo on a phone frame)
- [ ] Voiceover from the script's VO column
- [ ] Title + description + thumbnail (from the script header)
- [ ] Captions (accessibility — pull from the VO text)
- [ ] Publish to YouTube; grab the URL
- [ ] Add the URL to the matching KB article once the in-app video layer ships
