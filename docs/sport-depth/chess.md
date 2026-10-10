# Chess — depth audit

Standard sources:
- FIDE Laws of Chess (2023): result types (art. 5, 6.9, 9), and the clock and time controls (art. 6).
- FIDE General Regulations for Competitions and Handbook C.04 (Swiss systems: the Dutch system C.04.3, byes, colour allocation).
- FIDE C.07 Tie-Break Regulations (2023): Buchholz, Buchholz Cut-1 / Median, Sonneborn-Berger, Direct Encounter, number of wins (WIN/WON), games with Black (BPG/BWG), Progressive score, Average Rating of Opponents (ARO), and the rules for unplayed games.
- FIDE Rating Regulations B.02: Elo, performance rating.
- Chess-Results.com / Swiss-Manager tournament outputs: crosstable, rank list with tie-break columns, and the per-player card showing opponent, colour and result each round.
- The earlier replay: `docs/sport-coverage/replay-validation.md` (Candidates 2024, Tata Steel 2024).

Summary: one game is captured correctly as a **result-only** record: the winner or a draw, how it ended (9 FIDE methods), which side had White, an optional move count, and the time-control category. Round-robin standings are FIDE-grade: 1-½-0, Sonneborn-Berger, number of wins, then direct encounter, replay-checked against Candidates 2024.

**Swiss, the format almost every school and open chess tournament uses, is not at that standard:**
- No bye point.
- No Buchholz or Buchholz Cut-1.
- Greedy pairing: no Dutch score-group halves and no colour balancing.
- No player card showing each round's opponent, colour and result.
- No tie-break column on the table, and the table header says "Team".

**Player profile:** generic Matches / Wins / Win rate, where win rate ignores draws. There is no score %, no record by colour or time control, and no rating or performance rating.

A PGN or move entry is optional and practical only as a paste or upload (P2).

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Result 1-0 / 0-1 / ½-½, written White first | Core | `resultString` (`engine.ts:64-70`). Scoreboard shows ½ (`index.tsx:114-124`). | ✅ | |
| Termination: checkmate, resignation, time, agreement, stalemate, repetition, 50-move, insufficient material, forfeit | Core | `ChessMethod` (`engine.ts:7-18`), with method/outcome consistency enforced (`:49`) | ✅ | Missing: "dead position" (5.2.2), "75-move / fivefold" (automatic), "lost on time but the opponent can't mate → draw" (6.9; can be entered as a draw with no method), **double forfeit 0-0**, **adjudication** and **arbiter decision / penalty**. |
| Colours (who has White) | Core | `SET_WHITE` (`engine.ts:40-43`) | ⚠️ | Defaults to home. The summary says "Home has White" instead of the player's name (`index.tsx:122`). Colour isn't written to the stat line (`index.tsx:46-51`), so per-colour records are impossible. |
| Time control | Core | Category only: classical / rapid / blitz / bullet / untimed (`index.tsx:126-138`) | ⚠️ | FIDE writes it as base + increment (e.g. 90'+30"). No free-text or minutes+increment field. The category isn't stored per stat line. |
| Number of moves | Adv | Optional (`engine.ts:50`) | ✅ | |
| Round / board number | Core | Round comes from the fixture's stage (`swissN`). No board number. | ⚠️ | A wall chart lists the board. |
| Opening (ECO), PGN / move list | Adv | — | ❌ | Live move entry by one scorer isn't practical (§5). Pasting PGN or uploading the scoresheet after the game is practical (CH-09). |
| Player ratings shown on the game | Core | — | ❌ | No rating field. A free-text "e.g. FIDE 1650" exists in `sportProfileFields.ts:67`. |

## 2. Team level

Chess is played by individuals in this app (`participantKind: 'individual'`, `index.tsx:105`). The team-level stats that matter are **team matches** (Olympiad, school inter-house: 4 boards). There, match points (2/1/0) are ranked first, then board points (game points).

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Team match of N boards: board points, match result, match points | Core (Olympiad / team events) | — (one game is one fixture) | ❌ | Shared need with carrom and table tennis team ties (GEN-06). |
| Team standings by match points, then board points / SB | Core | — | ❌ | |
| Board-by-board individual scores in team events | Core | — | ❌ | |
| A club's or school's players' record | Adv | Generic team profile, where a "team" is the 1-player side | ⚠️ | |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Round-robin scoring 1-½-0 | Core | `defaultStandingsConfig` (`standings.ts:94`) | ✅ | |
| Sonneborn-Berger | Core | `standings.ts:237-247` | ✅ | Replay-checked. It counts a forfeit win like a played win; FIDE C.07 treats unplayed games differently. |
| Direct encounter, number of wins | Core | `h2h`, `wins` (`standings.ts:267-273`) | ✅ | No distinction between WIN (including unplayed) and WON (played only). |
| **Swiss pairing-allocated bye = 1 point** (or ½, by the event's rules) | Core | A bye is recorded on the fixture (`GenerateFixturesScreen.tsx:266-276`, `Match.byes`) but **`teamStandings` ignores it** | ❌ | The player who sat out is a point short. The ranking is wrong from round 1 in any odd-sized field. |
| **Buchholz, Buchholz Cut-1, Median** | Core (the default Swiss tie-breaks) | — (`TieBreaker` has no BH, `standings.ts:65`) | ❌ | Without it a Swiss tie can't be ranked to FIDE. The available list is `sb, wins, h2h` only (`standings.ts:112`). |
| Progressive (cumulative) score, games with Black, ARO | Core / Adv | — | ❌ | Progressive and Black games come from round order and colours. ARO needs ratings. |
| Swiss pairing to FIDE Dutch (C.04.3): score groups, S1 vs S2 halves, floaters, colour preference and balance (no 3 in a row, imbalance ≤ 2) | Core | Greedy: pairs each player with the nearest-ranked opponent not yet met (`swiss.ts:41-65`). Round 1 is top half vs bottom half (`:20-33`), correct. No colours. | ⚠️ | Round 2 onward pairs 1 v 2 inside a score group (Dutch pairs 1 v n/2+1). Colours are never assigned, so `white` defaults to home every game. An arbiter would notice. |
| Rank list with tie-break columns | Core | `StandingsScreen.tsx:272-279`: # Team P W D L Pts | ⚠️ | No SB / BH / Wins column. The header reads "Team" for players. Wins/Draws/Losses as columns are fine, but chess tables show **Pts and TB1..TBn**. |
| Crosstable (round robin) / wall chart (Swiss: opponent rank, colour, result per round) | Core | — | ❌ | The standard printed output of every chess event. |
| Ranking by rating group / age category (U-9, U-11, best girl, best unrated) | Core in school chess | Categories exist elsewhere (team-entry overhaul), not chess-specific | ⚠️ | Prize lists by category are standard in Indian school chess. Check the categories feature. |
| Leaderboard | Core | `STAT_CATEGORIES.chess`: wins, draws (`standings.ts:422`). Award "Most wins" (`ratings.ts:196`). | ⚠️ | In chess the award order **is** the standings. "Most draws" is meaningless. Better: score, performance rating, best score with Black. |
| Playoff / armageddon after a tie | Core (elite) | Not modelled (replay-validation) | ❌ | P2. |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Games, W / D / L | Core | `attribution` `games` plus `extra {wins\|draws\|losses}` for both players (`index.tsx:46-58`) | ✅ | Labels fall back to raw keys: `wins`/`draws`/`losses` aren't in `SportProfileScreen` LABELS (`:25-37`). |
| Score and score % ((W + ½D) / games) | Core | "Win rate" = wins / matches (`SportProfileScreen.tsx:179`) | ⚠️ | Counting draws as zero understates every chess player. |
| Record by colour (W/D/L with White and with Black) | Core | — (colour isn't on the line) | ❌ | |
| Record by time control (classical / rapid / blitz) | Core | — | ❌ | FIDE keeps a separate rating per time control. |
| Rating (FIDE / national / club) with FIDE ID | Core | Free text only (`sportProfileFields.ts:50,67`) | ❌ | Entered by hand; no rating calculation needed. |
| Performance rating per event (Rp = Ra + dp) | Core | — | ❌ | Needs opponent ratings. |
| Results by method (wins by mate / resignation / time) | Adv | Method stored in state, not on the line | ❌ | Cheap to add. |
| Best win (highest-rated opponent beaten), longest unbeaten streak | Adv | — | ❌ | |
| Forfeits excluded from played stats | Core | A forfeit counts as a played game | ⚠️ | |

## 5. Out of scope (needs tracking or extra spotters)

- **Live move-by-move entry by a scorer.** One phone per board, a scorer per board, and time spent on every move. Not practical for a school event. A DGT board or e-board feed is out of scope.
- Engine analysis (accuracy, blunders, centipawn loss) and clock times per move. These need the full PGN with clock comments and an engine.
- A full FIDE-endorsed Dutch pairing engine (JaVaFo-grade with every C.04.3 rule). Out of scope as **certified** pairing. A score-group, colour-aware Dutch approximation (CH-03) is in scope. Rated events can import pairings from Swiss-Manager (CH-10).

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| CH-01 | **Swiss bye points:** credit a pairing-allocated bye as a scored, unplayed win. Default 1 point; organiser choice of 1 / ½ / 0 in the points editor. It counts in Pts, counts as "unplayed" in the tie-breaks (C.07), and shows as "bye" on the player card. | P0 | S | Tournament | None (`Match.byes` already persisted) | No (formats jsonb key `byePoints`) | Yes, any Swiss (GEN-07) |
| CH-02 | **Buchholz, Buchholz Cut-1, Median-Buchholz and Progressive score** as `TieBreaker`s, with FIDE C.07 (2023) handling of unplayed rounds. A Swiss chess default of `bhc1, bh, sb, wins` (organiser-editable); round robin keeps `sb, wins, h2h`. | P0 | M | Tournament | None | No | Yes (GEN-07) |
| CH-03 | **Colour-aware Swiss pairing:** pair inside score groups top half vs bottom half (Dutch S1 vs S2), with floaters down. Assign White by colour preference: alternate, never three in a row, imbalance ≤ 2. Write the colour into the fixture so the game opens with the right `white`. | P0 | M | Tournament, Match | New optional fixture key `white: 'home'\|'away'` read by `init(config)`. Old matches default to home as today. | No (format jsonb) | Pairing yes; colours chess only |
| CH-04 | **Chess rank list:** "Player" header; Pts, then one column per active tie-break (SB / BH-C1 / BH / Wins). Hide W/D/L behind a toggle. | P0 | S | Tournament | None | No | GEN-03 |
| CH-05 | **Chess career on the sport profile:** games, score and score %, W/D/L, the same by White and by Black, by time control, wins by method, unbeaten streak. Needs `colour`, `timeControl` and `method` on the stat line. | P0 | M | Player | Optional keys added to the RESULT attribution `extra` (`white:1`/`black:1`, `<tc>Games`, method counts). Old lines lack them and count in totals only, like cricket #19. | No | GEN-02 |
| CH-06 | **Wall chart / crosstable:** round robin as a grid; Swiss as one row per player with each round's "opp rank + colour + result" (e.g. `12w1 4b½`). Tap through to the player card. | P1 | M | Tournament | None | No | No |
| CH-07 | **Ratings:** FIDE ID plus rating per time control on the player's chess profile (structured, replacing the free text). Seed Swiss round 1 by rating. ARO and performance rating per event on the player card and rank list. | P1 | M | Player, Tournament | None | Possibly: structured `sportDetails.chess.ratings` fits the existing jsonb, so no migration. | No |
| CH-08 | **More results:** double forfeit 0-0, "dead position", adjudicated, arbiter's decision. Exclude forfeits from played-game stats and SB. Put the player's name in "has White" (`index.tsx:122`). Allow an optional exact time control (minutes + increment). | P1 | S | Match, Player | New optional methods/values. Old logs are unaffected. | No | No |
| CH-09 | **PGN attach:** paste PGN text or upload a scoresheet photo after the game; show the moves read-only, with ECO and opening name taken from the PGN. | P2 | M | Match | New optional action `PGN {text}`. No effect on the result. | No (state jsonb); a photo would use storage | No |
| CH-10 | **Import pairings and results** from a Swiss-Manager / Chess-Results export (TRF-16), for rated events run by an arbiter. | P2 | M | Tournament | None | No | No |
| CH-11 | **Team match (N boards):** board points plus match points, ranked by match points then board points. | P1 | L | Team, Tournament | New fixture shape (GEN-06) | Likely | GEN-06 |
| CH-12 | Leaderboards and awards: replace "Most draws" with Score, Performance rating, Best on board / category prizes (best U-11, best girl, best unrated). | P2 | S | Tournament | None | No | No |

**GEN- candidates from chess:**
- GEN-02: a shared career framework.
- GEN-03: tie-break columns on standings, plus a "Player" header for individual sports.
- GEN-06: team ties made of individual rubbers (chess boards, carrom team events, the table tennis Swaythling format), with match points vs game points.
- GEN-07: Swiss done properly for any sport: bye points, Buchholz family, score-group pairing.
