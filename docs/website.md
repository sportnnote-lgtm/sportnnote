# Website — sportnnote.in

**What it is:**
- A static site built from this repository: `website/` (styles and config) plus
  `scripts/build-website.mjs`, which outputs `website/dist/`.
- Pages: the home page, `/privacy/`, `/terms/` and a 404 page.
- Privacy and Terms are generated from `src/data/legal.ts`, the same text the app shows, so
  they never drift apart.

**Build and preview:**
- `npm run website:build`
- Preview with the `website` entry in `.claude/launch.json` (http://localhost:8095).

**Settings:** `website/config.json`.
- `androidApkUrl`: set it to the APK install link when the build finishes, and the Android
  card switches from "add to home screen" to a download button.
- `appUrl`, `contactEmail`, `city`.

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
