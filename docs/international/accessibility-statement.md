# SportnNote accessibility statement and conformance summary (VPAT-style)

**Standard:** WCAG 2.1 Level A and AA. This is what US ADA Title II requires of public schools and districts from the 2026–27 school year, and it is the usual bar for UK public bodies (PSBAR) and for EU Accessibility Act procurement.
**Product:** SportnNote mobile app (iOS, Android) and web app (React Native / react-native-web), plus the marketing website.
**Scope of this review:** the core flows: sign up and sign in, Home, live scoring for every sport (including the shared scoring controls), standings, bracket and team journey, player profile, tournament page, and results entry (athletics, swimming and other event keypads).
**Date:** 11 Oct 2026 (SD-155). **Method:** code review against WCAG 2.1, automated checks (`tests/a11y-labels.test.mts`, `tests/a11y-contrast.test.mts`), and keyboard and accessibility-tree checks on a static web build at 375 px and desktop widths. A manual VoiceOver and TalkBack pass on real devices is **not yet done** (see Known gaps).
**Public page:** sportnnote.in/accessibility/, built from `scripts/build-website.mjs`.

Conformance terms follow VPAT 2.5:
- **Supports:** meets the criterion in the core flows.
- **Partially supports:** some parts do not meet it.
- **Does not support:** most of it does not meet it.
- **Not applicable:** the criterion does not apply to this product.

## What changed in SD-155

- **Contrast (1.4.3, 1.4.11):**
  - New theme tokens: `dangerStrong #D32F2F` for solid red pills with white text, `onFill #06120D` for dark ink on bright fills, `inputBorder #6A7482` for field edges, and `focus #FFB454` for the focus ring.
  - Fixed white text on bright fills: the LIVE scorer pill, UNDER REVIEW, the dispute count, the unread badge and the REPORTED tag were 2.8–3.0:1 and are now 4.98:1. The results keypad buttons "✓ Mark", "O clear" and "✓ Good lift" were 1.8:1 and are now 10.8:1. The over-editor ball chips and the golf team chips were 1.8–3.0:1 and are now 6.3–10.8:1.
  - Team-coloured buttons now pick whichever ink contrasts most. The old cut-off put white on red/blue kits at 2.6–3.0:1.
  - Team-coloured score digits are lightened when a kit is too dark to read on the board.
  - Text-field borders were 1.3:1 and are now 3.3–4.0:1.
  - `font.tiny` went from 11 to 12 px.
- **Name, role, value (4.1.2):**
  - Every pressable in the core set has a role and a name. A test enforces this.
  - Symbol-only buttons (✕, ↺, −, +, ‹, ›, ✓) have spoken labels.
  - Cricket's run pad reads "Dot ball, no run", "2 runs", "Four (boundary)", "Wide plus 2 runs, 3 total" and "No ball plus 4 runs off the bat, boundary".
  - The serving side's point button says ", serving".
  - Toggles expose their state: `aria-pressed` on chips and toggle buttons, `aria-selected` on tabs, `aria-expanded` on disclosures and `aria-checked` on checkboxes. Before this change react-native-web dropped `accessibilityState` entirely.
  - The scoreboard and mini score read as one sentence, for example "1st Half. Red House 2. Blue House 1, 1 red card".
- **Forms (1.3.1, 1.3.5, 4.1.2):** sign-in and sign-up fields were named only by their placeholder. They now have spoken labels and `autoComplete` (email, current-password or new-password, one-time-code).
- **Status messages (4.1.3):** every score change is announced politely: a live region on Android, `announceForAccessibility` on iOS, and `aria-live` on the web. Changes are debounced so a burst of taps reads once.
- **Keyboard (2.1.1, 2.4.7):**
  - On the web, every control shows a 3 px amber focus ring (≥10:1 against the page).
  - Space now works on tabs and other non-button roles, which react-native-web ignored.
  - Text links that had no role (Terms, Privacy, venue map links, "Use a different number", "Transfer ownership", Cancel links) are now reachable with Tab.
  - The duplicate standings stats row is removed from the tab order.
  - The website has a "Skip to content" link.
- **Non-text content (1.1.1) and use of colour (1.4.1):**
  - The cricket wagon wheel can be picked from a named list, and the batter's wheel reads runs per zone.
  - The football pitch reads both formations as text.
  - Red-card markers say "N red cards".
- **Reflow and text size (1.4.4, 1.4.10):** fixed-height pills, badges and pad rows became `minHeight`. Very large score digits cap OS scaling at 1.5× (`maxFontSizeMultiplier`) rather than clip. `allowFontScaling` is never turned off. The app has no horizontal scroll at 375 px.
- **Touch targets:** buttons and text fields are at least 44 pt. Chips are 36 pt plus `hitSlop`, which gives 44 pt on native. Standalone text links get padding. Inline links in sentences are exempt.
- **Motion (2.3.3, good practice):** the pulsing LIVE dot and the confirm sheet's slide respect "Reduce motion" on iOS and Android and `prefers-reduced-motion` on the web.

## Conformance table: WCAG 2.1 Level A

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 1.1.1 Non-text content | A | Partially supports | Icon buttons, scoreboards, wagon wheel, pitch, court maps and charts in the core set have text alternatives. Decorative emoji in labels are read by some screen readers. Player and team photos use initials as the fallback. Some stats charts outside the core set have no data-table alternative yet. |
| 1.2.1–1.2.3 Audio/video | A | Not applicable | The app does not host pre-recorded media. A live-stream link opens the broadcaster's own player. |
| 1.3.1 Info and relationships | A | Partially supports | Headings use `accessibilityRole="header"`, form fields have labels, and tables have row labels on native. On the web, stats tables are `div` grids without `table` semantics, so row and column headers are not announced as such. |
| 1.3.2 Meaningful sequence | A | Supports | DOM and reading order follow the visual order. Split tables hide the duplicate column from assistive technology. |
| 1.3.3 Sensory characteristics | A | Supports | Instructions name the control ("Tap a side to score it"), not its colour or position alone. |
| 1.4.1 Use of colour | A | Supports | Team buttons carry the team name, win/loss pills carry W/D/L text, LIVE has text, and the wagon wheel legend has text counts. |
| 1.4.2 Audio control | A | Not applicable | No auto-playing audio. |
| 2.1.1 Keyboard | A | Partially supports | Every scoring pad, tab, chip, dialog and link works with Tab, Enter and Space on the web. Long-press shortcuts (crediting a player) also have a tap path. Drag-to-reorder lists outside the core set are mouse/touch only. |
| 2.1.2 No keyboard trap | A | Supports | Modal sheets close with Escape (`onRequestClose`) and with their Cancel buttons. |
| 2.1.4 Character key shortcuts | A | Not applicable | No single-key shortcuts. |
| 2.2.1 Timing adjustable | A | Supports | The ~60 s "result held" window (SD-111) can be cancelled (Undo) or sent at once. Nothing times out a user's input. |
| 2.2.2 Pause, stop, hide | A | Supports | The only moving element is the LIVE dot. It stops with Reduce Motion and is under 5 s per cycle. |
| 2.3.1 Three flashes | A | Supports | Nothing flashes more than 3 times per second. |
| 2.4.1 Bypass blocks | A | Partially supports | The website has a skip link. The app has a short header and tab bar on each screen, but no skip link. |
| 2.4.2 Page titled | A | Supports | Every navigator screen sets a title, and the web tab title follows it. |
| 2.4.3 Focus order | A | Supports | Logical order. The confirm sheet focuses the safe "No" first. |
| 2.4.4 Link purpose (in context) | A | Supports | Links say where they go ("Map: Kanteerava Stadium", "Open Red House"). |
| 2.5.1 Pointer gestures | A | Supports | Long-press is never the only way to do something. There are no multipoint gestures. |
| 2.5.2 Pointer cancellation | A | Supports | Actions fire on release (platform default). |
| 2.5.3 Label in name | A | Supports | Spoken names start with the visible text ("Undo: point to RED (15-16)"). |
| 2.5.4 Motion actuation | A | Not applicable | No shake or tilt input. |
| 3.1.1 Language of page | A | Supports | `lang="en"` on the web app and website. |
| 3.2.1 On focus / 3.2.2 On input | A | Supports | Focus and typing never change context. Chips change only the selection. |
| 3.3.1 Error identification | A | Supports | `FormError` shows the error as text with `role="alert"`. |
| 3.3.2 Labels or instructions | A | Supports | Every `TextField` has a programmatic label. |
| 4.1.1 Parsing | A | Supports | Generated by React. Obsolete in WCAG 2.2. |
| 4.1.2 Name, role, value | A | Supports | Enforced for the core set by `tests/a11y-labels.test.mts`. State is exposed on native and the web. |

## Conformance table: WCAG 2.1 Level AA

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 1.2.4 Captions (live) / 1.2.5 Audio description | AA | Not applicable | No hosted media. |
| 1.3.4 Orientation | AA | Supports | Portrait and landscape both work, and nothing is locked. |
| 1.3.5 Identify input purpose | AA | Partially supports | Sign-in and sign-up fields set `autoComplete`: email, current-password or new-password, one-time-code, and tel on the phone field. Profile and guardian fields don't yet. |
| 1.4.3 Contrast (minimum) | AA | Supports | All theme pairs pass 4.5:1 for text and 3:1 for large text and UI, checked by `tests/a11y-contrast.test.mts`. Team colours are adjusted at render time. Disabled controls are exempt. |
| 1.4.4 Resize text | AA | Partially supports | Native respects the OS text size, and layouts use `minHeight`. The two big score numerals are capped at 1.5×. On the web, browser zoom works to 200%, but the browser "text size only" setting does not, because sizes are in px. Not yet verified at 200% on real iOS and Android devices. |
| 1.4.5 Images of text | AA | Supports | None, apart from the logo. |
| 1.4.10 Reflow | AA | Supports | No horizontal scroll at 320–375 px. Wide stats tables scroll inside their own box, which is allowed for data tables. |
| 1.4.11 Non-text contrast | AA | Supports | Field borders ≥3:1 and the focus ring ≥10:1. Selected chips differ in fill (10:1), not only in hue. |
| 1.4.12 Text spacing | AA | Partially supports | No fixed-height text boxes in the core set after SD-155. Single-line names use `numberOfLines={1}` with an ellipsis, and the full text is in the accessible name. |
| 1.4.13 Content on hover or focus | AA | Not applicable | No hover tooltips. |
| 2.4.5 Multiple ways | AA | Supports | Search, Discover, Home feed, follows and deep links. |
| 2.4.6 Headings and labels | AA | Supports | Section headers are descriptive. |
| 2.4.7 Focus visible | AA | Supports | 3 px amber ring with a 2 px offset on every focusable element on the web. Native uses the platform focus highlight. |
| 3.1.2 Language of parts | AA | Not applicable | English only. |
| 3.2.3 Consistent navigation / 3.2.4 Consistent identification | AA | Supports | Shared tab bar and shared components (Undo, ConfirmSheet, PointButtons). |
| 3.3.3 Error suggestion | AA | Supports | Errors say what to fix ("That image is over 5 MB — pick a smaller one"). |
| 3.3.4 Error prevention (legal, financial, data) | AA | Supports | Match-ending, deleting and clearing actions ask first (ConfirmSheet). Account deletion asks you to type DELETE. Results are held about 60 s and can be undone. |
| 4.1.3 Status messages | AA | Supports | Score changes, toasts, the backfill banner, rules cues and form errors are announced (live regions or alerts). |

## Known gaps (not yet conformant, or not yet verified)

1. **Real-device screen-reader pass.** No full VoiceOver (iOS) or TalkBack (Android) walk-through of every sport's scoring yet. The automated checks prove each control has a name and role, not that every flow reads well. Owner: QA before the US school pilot.
2. **200% text on devices.** Layout changes were made from code review. iOS Larger Text and Android font scale 2.0 have not been screenshot-tested for all 24 sports.
3. **Web tables.** Stats tables (BoxScore, LeagueTable, crosstables) are not exposed as `table`/`columnheader`/`cell` on the web (1.3.1).
4. **Screens outside the core set** (org admin, messaging, club management, setup wizards for meets) have not had the label/role pass. About 120 role-less `Text onPress` links remain there. The lint test covers only the core set and is meant to be widened screen by screen.
5. **Browser text-size setting** (1.4.4 on the web): px-based sizing ignores it. Browser zoom is the supported path.
6. **Sports added after SD-155** (netball, rugby, ice hockey) join the lint's `AUDITED_SPORTS` list once they have had their own pass.
7. **Wagon wheel (viewer) and court/heat maps** have text summaries but no full data-table alternative.
8. **Emoji in visible labels** (⚽, 🏏) are read out by some screen readers ("soccer ball Goal"). This is a minor annoyance, not a blocker.

## How we test and keep it this way

- `npm test` runs `tests/a11y-labels.test.mts`. It parses every TSX file in the core set and fails on any pressable without a role, without a name, or with a symbol-only label and no spoken label. It also runs `tests/a11y-contrast.test.mts`, which checks every token pair plus tinted pills against AA.
- `src/core/contrast.ts` (`readableOn`, `ensureContrast`) is the only way to put text on a team colour.
- `src/core/a11y.ts` holds the web focus ring, the keyboard bridge, `announce()`, `useReducedMotion()` and `toggleA11y()`. `src/components/LiveAnnouncer.tsx` announces score changes.

## Feedback and contact

Email the support address on sportnnote.in/support/ (`contactEmail` in `website/config.json`) with "Accessibility" in the subject. We reply within the support hours listed there, and we fix blocking issues on the scoring screens first. A formal VPAT 2.5 (WCAG edition) can be supplied to school districts on request. It is generated from this document.
