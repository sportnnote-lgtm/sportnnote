# SportnNote — Master Roadmap

*Living document. Owner: the founder (final decision-maker). Maintained by the CTO/PM
agent and updated whenever priorities or state change. Last updated: 2026-10-06.*

**How to read this:**
- §1 is the situation.
- §2 is the order of execution (the important part).
- §3 lists the decisions needed from you.
- §4 covers all 20 areas.
- §5 is the priority rubric used everywhere.

---

## 1. Where we actually are (honest snapshot)

**The product is strong. Distribution and operations are the gap.**

| Area | State |
|---|---|
| Sports | 10 sports with real scoring engines (football, cricket, basketball, kabaddi, tennis, badminton, volleyball, pickleball, padel, squash). Format presets and tie-breakers are rulebook-grounded. |
| Tournaments | Real tournament engine: groups, knockouts, Super Four, play-ins, 3rd place, Swiss, Americano, series, medal meets, divisions and registration. It passes the "schedule FIFA WC 2026 / Asia Cup as-is" litmus test. |
| Organisations | Organisations, schools (houses, classes), clubs, roles, ownership, officials, audit trail. |
| Backend | Supabase is production-shaped, plus 12 edge functions. |
| Security and privacy | Hardening done but **not deployed**: 0025 (scoped writes), 0026 (private contact details), 0027 (messaging and guardian accounts). Covered by 199 database scenarios. |
| Quality | 292 unit tests, typecheck clean. Offline-safe live scoring. |
| Release | Running in **demo mode**. Live migrations 0012–0027 are pending. One preview APK has been built. No store listings. iOS needs an Apple Developer account. |
| Missing operational pieces | No legal entity. No phone OTP (WhatsApp blocked on Meta Business Verification, which needs an entity). No analytics, no crash reporting, no privacy policy/terms in-app, no website beyond the GoDaddy domain page. |
| Original pilot target | 2026-08-23. **Passed.** It needs a new date (see §3). |

**The single most important insight:** the next bottleneck isn't code, it's the
**company**. A registered entity unblocks:
- Meta Business Verification, and with it WhatsApp OTP;
- Indian SMS (DLT registration requires a business);
- a Google Play *organisation* account (personal accounts must run a closed test before
  production);
- the Apple Developer *organisation* account (needs a D-U-N-S number);
- a business bank account, payment gateways later, contracts with schools, and investors.

So company formation is on the critical path for launch, even though it isn't engineering.

---

## 2. Recommended order of execution

Work runs in **three parallel lanes**, because they use different resources:
- **Lane E (engineering):** me, plus engineering agents.
- **Lane C (company):** you, with my research and step-by-step guidance. It's mostly paperwork and waiting.
- **Lane O (operating system):** the AI-agent company, started small.

### Phase 0 — Close what's open (this week)
| # | Item | Lane | P |
|---|---|---|---|
| 0.1 | Commit the security/privacy/messaging work (one commit, as agreed) | E | P0 |
| 0.2 | Run live migrations 0012 → 0027 in order, deploy 9 edge functions, set `WEBHOOK_SECRET` | You + E | P0 |
| 0.3 | Answer the company-formation questions (§3-A) → I give the entity recommendation | You | P0 |
| 0.4 | Instrument the product: crash reporting + product analytics (the agents need data — see §4-18) | E | P0 |

### Phase 1 — Foundation (weeks 1–4)
**Lane C:**
- Incorporate.
- PAN/TAN and GST registration (if required).
- Bank account.
- D-U-N-S number.
- DPIIT recognition.
- Trademark filing for "SportnNote".

**Lane E:** Golf v1 (design → engine → tournament/leaderboard → stats → tests). It's the right
engineering work while Lane C waits on government timelines.

**Lane O:** stand up the Decision Inbox and the first 4 agents (§4-7). Produce a weekly
improvement report before attempting daily.

**Lane E (small, parallel):** code-based website v1 (§4-17), plus privacy policy and terms
pages. These are needed for store review and DPDP.

### Phase 2 — Accounts and communications (weeks 3–8, gated on incorporation)
- Meta Business Verification → WhatsApp Business Platform → OTP template → turn on the
  WhatsApp OTP code that's already built.
- DLT registration → SMS OTP provider as the fallback channel. Email is already live via
  Resend on sportnnote.in.
- Google Play organisation account and Apple Developer organisation account → store
  listings.
- Supabase Pro (backups, point-in-time recovery) before real users' data.

### Phase 3 — Launch readiness and pilot (weeks 6–10)
- Flip `TESTING_ALLOW_UNVERIFIED` to `false`.
- Run the clean-slate wipe.
- Do a closed pilot with 2–3 Bengaluru schools/clubs. Support runbook, monitoring, status
  alerts.
- Store submissions: Android first, then iOS.

### Phase 4 — Grow (after the pilot proves retention)
- Daily agent reports.
- Sales/marketing agents run outbound to schools and academies.
- SEO landing pages per sport and city.
- Monetisation design: subscription seam (year 2, per the earlier decision).
- Next sports on the field engine Golf creates (athletics, swimming).

**What we deliberately do NOT do yet:**
- hire;
- build 40 agents;
- paid ads before retention is proven;
- a US "flip" structure;
- multi-region infrastructure;
- monetisation.

---

## 3. Decisions I need from you (only these)

**A. Company formation.** These questions are the ones that actually change the answer:
1. Are you an Indian resident and citizen, and which state will the registered office be in
   (Karnataka/Bengaluru)?
2. Will a second person hold shares or be a director (a family member is fine)? A Private
   Limited company needs **2 directors and 2 shareholders**; a One Person Company needs 1.
3. Within ~18 months, do you expect to raise outside money (angels/VCs), or stay
   bootstrapped? Any likelihood of **foreign** investors?
4. Are you currently employed or contracted anywhere? This affects IP ownership and
   moonlighting clauses — the company must cleanly own the code.
5. Will you charge Indian customers (schools/clubs) in the next 12 months, and roughly how
   much? This decides when GST is needed.

My provisional leaning, to confirm after your answers: an **Indian Private Limited company**,
with DPIIT Startup India recognition. It's the standard vehicle for a tech company that
intends to raise and scale, can issue ESOPs, and is accepted by Meta, Apple, Google and
banks. A One Person Company is the fallback if no second person is available, and it can
convert later. LLP and sole proprietorship are poor fits for investors.

**B. Golf scope.** Recommended default; say if you disagree:
- **v1:** individual **stroke play** (gross and net), **Stableford**, and **match play**.
  18- and 9-hole rounds, multi-round events, cut lines, a live leaderboard.
- **v2:** team formats (scramble, four-ball, foursomes) and skins.
- **Handicaps:** players enter their own WHS Handicap Index. We compute course handicap,
  playing handicap and net scores. We don't issue an "official" index — only authorised
  golf associations can.
- **Question:** is Golf for the **launch** set, or the first post-pilot sport? I recommend
  building it now in Lane E, and launching it once it passes the same litmus test as other
  sports. A real event to replicate would be a club medal day or a junior golf tour round.

**C. New pilot date.** Pick a target. I suggest **~8–10 weeks out**, gated on Phase 2
accounts. Also pick 2–3 success KPIs. My suggestion:
- weekly active organisers;
- matches scored per week;
- 4-week retention of scorers.

**D. Website stack.** Move from the GoDaddy page to a site **built from code in this repo**,
deployed on a free static host (Cloudflare Pages / Vercel) and keeping the sportnnote.in
domain. This is what lets the Website Agent safely *implement* approved changes as reviewed
PRs, rather than only suggesting them. A code-based site also gives the invite links a
proper domain for their pages (the Supabase functions domain forces plain text).

**E. Tooling budget.** Bootstrapped, so approve or adjust the starter stack. It's free or
near-free at our scale:

| Tool | Cost |
|---|---|
| Crash reporting (Sentry) | Free tier |
| Product analytics (PostHog) | Free tier |
| Supabase Pro | About $25/month, needed before real users |
| Store fees | Apple about $99/year; Google $25 once |
| WhatsApp / SMS | Per-message costs |

---

## 4. All 20 areas

Format: **Current → Desired · Missing · Depends on · Approach · Priority · Next action.**

### 4-1. Current product state
- **Current:** feature-rich, demo mode, security work pending deploy.
- **Desired:** live, hardened, instrumented, in the stores.
- **Missing:** live migrations; analytics/crash reporting; store listings; legal pages.
- **Approach:** Phase 0 → Phase 3.
- **P0.** **Next:** commit, then run the migrations.

### 4-2. Golf integration
- **Current:** no golf. The core assumes head-to-head matches. The plugin contract reserves
  a `measured` type that's unimplemented.
- **Desired:** golf as a complete sport — scoring, tournaments, stats, profiles, handicaps,
  discovery.
- **Missing:**
  - (a) **Field-competition core:** N participants and a leaderboard, not home/away. This
    is reusable for athletics and swimming later.
  - (b) Golf plugin: per-hole scoring with fast entry (par, birdie… or strokes),
    putts/fairways/GIR optional, pickup/NR.
  - (c) Courses: par and stroke index per hole, tee ratings — slope and course rating.
  - (d) Formats: stroke, Stableford, match play (match play reuses the existing
    head-to-head core).
  - (e) Tournaments: rounds, tee times/groups, cut, ties/countback, live leaderboard.
  - (f) Stats: scoring average, GIR%, putts/round, handicap trend.
  - (g) Handicaps: course/playing handicap from the player's index.
- **Approach:** design doc → field core behind a feature flag with zero changes to existing
  sports' paths → golf engine with pure reducer tests → tournament → UI → litmus test
  (replicate a real club medal round).
- **Depends on:** decision B.
- **P1** (not launch-blocking). **Next:** I write the Golf design doc for your review.

### 4-3. Company formation
- **Current:** none.
- **Desired:** an incorporated entity that owns the IP, with bank, tax registrations and
  trademark.
- **Missing:** everything.
- **Depends on:** decision A.
- **Approach:**
  - I produce a step-by-step plan with costs and timelines after your answers.
  - Typical India path: Digital Signature Certificates → name reservation and incorporation
    (single online government form) → PAN/TAN issued with incorporation → bank account →
    GST when required → DPIIT recognition → IP assignment from you to the company →
    trademark.
- **P0.** **Next:** answer §3-A.

### 4-4. Infrastructure and accounts
- **Current:** Supabase (free), EAS, Resend + sportnnote.in DNS, Meta (unverified), GitHub
  private repo.
- **Desired:** all accounts owned by the company, with 2-factor auth and a credentials vault.
- **Missing:** Supabase Pro + backups; Apple/Google org accounts; a secrets inventory;
  `support@` / `security@` mailboxes on the domain.
- **Depends on:** 4-3.
- **P0.** **Next:** an account inventory (I'll draft it).

### 4-5. OTP and communications
- **Current:** email OTP live (Resend); WhatsApp OTP code-complete but blocked; push wired,
  with background delivery needing FCM credentials.
- **Desired:**
  - WhatsApp as the primary OTP channel in India;
  - SMS as fallback;
  - email for recovery and security alerts;
  - push for engagement;
  - one notification service with templates, consent and rate limits.
- **Missing:** Meta Business Verification; DLT registration; a provider comparison; a
  unified notification service; security-alert templates.
- **Depends on:** 4-3.
- **Approach:** a provider comparison doc comes next (I'll compare SMS/OTP options including
  Indian providers, global providers and Firebase phone auth, on India
  deliverability/DLT, international reach, cost per OTP, scale and developer experience).
- **P0** for launch. **Next:** comparison doc.

### 4-6. Security and verification
- **Current:** 0025–0027 written and tested, not deployed. Guardian phone OTP waits on
  WhatsApp. `TESTING_ALLOW_UNVERIFIED=true`.
- **Desired:**
  - deployed;
  - verification gate enforced;
  - DPDP-compliant consent records;
  - privacy policy and terms;
  - data deletion/export on request;
  - security monitoring.
- **Missing:** deploy; in-app legal pages; account deletion flow (also required by the
  stores); a consent ledger.
- **P0.** **Next:** deploy, then legal pages and account deletion.

### 4-7. AI-agent architecture (the company operating system)
- **Current:** just me, in sessions.
- **Desired:** a coordinated agent organisation feeding one Decision Inbox, with you
  approving.
- **Approach (start small, prove value, then add agents):**
  - **Decision Inbox** — one shared tracker (a database-backed page or GitHub issues). Every
    recommendation is a card with: problem, evidence, impact, effort, dependencies, risk,
    priority (P0–P3), recommended action, owner agent, and status (proposed → approved →
    in progress → measured).
  - **Starting agents (4)**, as scheduled cloud runs:

    | Agent | What it does | Cadence |
    |---|---|---|
    | Engineering | code review, tests, security and dependency scan, tech-debt list | daily |
    | Product/UX | walks key flows in the demo build, files UX issues | weekly |
    | Growth | website, SEO, competitor watch, content ideas | weekly |
    | Support/Insights | reads `support_cases`, message reports, store reviews → recurring problems | weekly |

  - **Chief-of-staff agent** merges these into **one** prioritised report.
  - **Approval rules:**
    - *Always needs you:* spend money; anything public-facing (publishing, sending email
      or messages to users, website changes going live); data deletion; pricing; legal;
      hiring; changes touching child-safety or privacy.
    - *Automatic:* research, analysis, drafting, running tests, opening draft PRs,
      dependency checks, internal reports.
  - **Loop:** research → analyse → recommend (card) → you approve → implement (PR/session)
    → Analytics measures → the result is written back to the card, and agents read past
    outcomes before recommending again.
- **Depends on:** 4-18 analytics. Agents without data produce opinions, not evidence.
- **P1.** **Next:** I'll design the operating model doc (division → agent → responsibility
  → inputs → analysis → output → dependencies → approval → frequency) and set up the
  Decision Inbox.

### 4-8. Operations
- **Current:** DEVLOG, docs folder, memory notes.
- **Desired:** runbooks (deploy, incident, data request), vendor/account register, decision
  log.
- **P1.** **Next:** vendor/account register (combined with 4-4).

### 4-9. Sales
- **Current:** none.
- **Desired:** an ideal-customer profile (schools with annual sports meets, academies,
  clubs, local leagues); a pilot→paid playbook; a pipeline.
- **Depends on:** pilot results and the entity (contracts).
- **P2 now, P1 at pilot.** **Next:** ideal-customer profile plus a list of the first 20
  target schools/academies in Bengaluru (Sales agent, after the website exists).

### 4-10. Marketing
- **Current:** brand name and tagline only.
- **Desired:** positioning, website, SEO pages per sport and city, social presence, launch
  plan.
- **Depends on:** the website.
- **P2 → P1 at launch.** **Next:** positioning statement and competitor matrix
  (CricHeroes, GameChanger, Playo, TeamSnap, sport-specific apps).

### 4-11. Finance
- **Current:** bootstrapped, no books.
- **Desired:** company bank account; bookkeeping; monthly burn tracker; tax calendar; unit
  economics when monetisation starts.
- **Depends on:** the entity.
- **P1 after incorporation.** **Next:** a cost register of current and planned spend.

### 4-12. Customer support
- **Current:** help centre plus AI assistant, escalation by email, message reports with a
  review screen.
- **Desired:** a triage runbook, FAQ coverage measured against tickets, a feedback-to-backlog
  loop.
- **P1.** **Next:** the Support/Insights agent (4-7).

### 4-13. Software engineering
- **Current:** solid architecture, tests, migrations-as-files.
- **Desired:**
  - CI on every push (typecheck, tests, the SQL policy suites);
  - a staging Supabase project;
  - migration runbook;
  - over-the-air update policy;
  - performance budgets.
- **Missing:** CI; staging; the PGlite policy suites committed to the repo (they currently
  live only in my scratch folder); crash reporting.
- **P0** (CI + staging before real users). **Next:** commit the policy suites as tests and
  add GitHub Actions.

### 4-14. AI (in product)
- **Current:** AI support assistant; voice scoring parsers.
- **Desired:** AI match summaries, highlight stats, talent insights for scouts, organiser
  copilot (fixtures, reminders), moderation assist for messages.
- **P2.** **Next:** pick one high-value feature after the pilot. AI match summaries is the
  cheapest and most visible.

### 4-15. Product / UI / UX
- **Current:** consistent dark design, organiser-first; a large surface built quickly.
- **Desired:** a design-system pass, IA cleanup, first-run journeys per persona (organiser,
  scorer, player, parent, scout), accessibility.
- **P1.** **Next:** a persona journey audit (Product/UX agent).

### 4-16. Design and animation
- **Current:** emoji-based iconography; no brand kit.
- **Desired:** logo system, brand kit, store screenshots, website visuals, a short promo
  video.
- **Depends on:** positioning (4-10).
- **P2** (store screenshots are P1 at submission). **Next:** brand-kit brief.

### 4-17. Website
- **Current:** a domain page on GoDaddy.
- **Desired:** a code-based marketing site:
  - home, features per persona (players, teams, organisations, schools, organisers), sports
    pages;
  - how-it-works / getting started;
  - comparison, FAQ, privacy, terms, contact;
  - pages for the join/invite links.
- **Website Agent:** reads DEVLOG and releases, proposes copy, SEO and conversion changes as
  PRs; you approve the merge.
- **Depends on:** decision D.
- **P1** (privacy and terms pages are P0). **Next:** site v1 in the repo.

### 4-18. Analytics
- **Current:** none.
- **Desired:**
  - product analytics with a defined event schema (activation = first match scored);
  - funnels;
  - retention;
  - crash-free rate;
  - a KPI dashboard the agents read.
- **P0** (before the pilot). **Next:** event schema plus SDK integration — privacy-safe, no
  personal data in events.

### 4-19. Launch readiness
- **Current:** the 7 audit blockers are shipped in code; deploy pending.
- **Desired:** a checklist gate — legal, verification on, backups, monitoring, support,
  store approval, pilot cohort signed up.
- **P0.** **Next:** I'll turn this into a go/no-go checklist page once Phase 2 starts.

### 4-20. Growth and scaling
- **Desired:**
  - Year 1: depth in Bengaluru schools/clubs → Karnataka → India.
  - Talent graph across sports.
  - Subscription for organisers/schools in year 2.
  - Infrastructure scales on Supabase (indexes, archiving, read replicas when needed).
- **P3** (documented, not worked on).

---

## 5. Priority rubric (used everywhere)

| Priority | Meaning |
|---|---|
| **P0 — Critical** | Required to function or launch safely (legal, security, data, core flows). |
| **P1 — High** | Growth, usability or scalability with clear near-term impact. |
| **P2 — Medium** | Real improvement, not blocking. |
| **P3 — Future** | Documented idea; not worked on. |

Every recommendation carries:
- **Why it matters**
- **Expected impact**
- **Effort** (S/M/L)
- **Dependencies**
- **Risk**
- **Priority**
- **Recommended next action**
