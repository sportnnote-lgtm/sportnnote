# Website — sportnnote.in

**LIVE 2026-10-07.**
- **Hosting:** Cloudflare Workers (static assets), Worker `sportnnote`, built from `main`
  on every push.
- **DNS:** moved from GoDaddy to Cloudflare (nameservers `leif` / `ollie.ns.cloudflare.com`;
  the domain is still registered at GoDaddy).
- **Custom domains:** `sportnnote.in` and `www.sportnnote.in`.
- **Redirect rules:**
  1. `app.sportnnote.in` → `concat("https://sportnnote.expo.app", path)` (301, query kept;
     needs the proxied placeholder A record `app` 192.0.2.1);
  2. HTTP → HTTPS.
- **Email DNS kept** (DNS only):
  - `send` MX → `feedback-smtp.ap-northeast-1.amazonses.com`;
  - `send` TXT `v=spf1 include:amazonses.com ~all` (was a GoDaddy-specific macro);
  - `resend._domainkey` DKIM;
  - `_dmarc`.

**What it is:**
- A static site built from this repository: `website/` (styles and config) plus
  `scripts/build-website.mjs`, which outputs `website/dist/`.
- Pages: the home page, `/guides/` and one page per guide (see Guides below), `/privacy/`,
  `/terms/` and a 404 page.
- Privacy and Terms are generated from `src/data/legal.ts`, the same text the app shows, so
  they never drift apart.

**Build and preview:**
- `npm run website:build`
- Preview with the `website` entry in `.claude/launch.json` (http://localhost:8095).

**Settings:** `website/config.json`.
- `androidApkUrl`: set it to the APK install link when the build finishes, and the Android
  card switches from "add to home screen" to a download button.
- `appUrl`, `contactEmail`, `city`.

## Guides (`/guides/`)

Public how-to pages, one Markdown file per guide in `website/guides/`.
- **Add a guide:** create `website/guides/<slug>.md` (lowercase-with-dashes; the file name
  is the URL `/guides/<slug>/`). Follow the content contract in `website/guides/README.md`:
  all seven front-matter fields, an allowed `category` and `audience`, and only the Markdown
  subset it lists. Screenshots go in `website/guides/img/` (copied to `/guides/img/`).
- **Build:** `npm run website:build`. The build **fails** with the file name and the reason
  on a missing field, unknown field, bad category/audience, non-integer `order`, bad
  `updated` date, bad file name or duplicate slug. Over-long titles/descriptions only warn.
- **What gets generated:** the `/guides/` index (filter box, category chips/sections in
  README order, cards sorted by `order` then title), one article page per guide (breadcrumb,
  "On this page", step cards, callouts, "Open SportnNote" CTA, previous/next and related
  guides in the same category), sitemap entries, `BreadcrumbList` JSON-LD on every guide
  page and `HowTo` JSON-LD when a numbered list sits under a heading containing "Step".
- **Drafts:** files starting with `_` (e.g. `_sample-test.md`, the renderer test fixture)
  are skipped. To preview them: `GUIDES_INCLUDE_DRAFTS=1 npm run website:build` (they get
  `noindex` and stay out of the sitemap). `GUIDES_DIR=<folder>` builds from another folder
  (for build tests only).
- **Preview:** build, then the `website` entry in `.claude/launch.json`
  (http://localhost:8095/guides/).

## Hosting (recommended: Cloudflare Pages, free)

- **Why:** free with no commercial-use limits (Vercel's free tier forbids commercial use);
  fast in India; deploys straight from the private GitHub repository; rebuilds the site on
  every push.

**Cloudflare Workers flow** (what the dashboard offers now): the repository has
`wrangler.jsonc`, which serves `website/dist` as static assets. Settings:
- Build command: `node --experimental-strip-types scripts/build-website.mjs`.
- Deploy command: `npx wrangler deploy`.
- Production branch: `feat/sport-formats-and-scoring`.
- The Worker name must be `sportnnote`, matching `wrangler.jsonc`.

**Older Pages flow steps** (once, about 15 minutes, needs your Cloudflare sign-up):
1. Create a free account at dash.cloudflare.com.
2. **Workers & Pages → Create → Pages → Connect to Git.** Authorise GitHub and pick
   `sportnnote-lgtm/sportnnote`.
3. Settings:
   - Production branch: `feat/sport-formats-and-scoring`, or `main` once that's updated.
   - Build command: `node scripts/build-website.mjs`.
   - Output directory: `website/dist`.
   - Environment variable: `NODE_VERSION` = `24`.
4. **Custom domain.** Add `sportnnote.in`. Cloudflare asks you to move the domain's
   **nameservers** from GoDaddy to Cloudflare; you keep the domain registered at GoDaddy.
   - Cloudflare copies the existing DNS records (check any email/MX records come across).
   - Then recreate the app link as a Cloudflare **Redirect Rule**: `app.sportnnote.in/*`
     → `https://sportnnote.expo.app/$1` (301). GoDaddy forwarding stops working once the
     nameservers move.

**Alternative (no nameserver move):** host on Cloudflare at `www.sportnnote.in` with a
CNAME in GoDaddy, and set GoDaddy forwarding `sportnnote.in → https://www.sportnnote.in`.
