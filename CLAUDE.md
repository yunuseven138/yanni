# Yunus Seven — Personal CV Website

## Project Overview

Single-page personal CV website for Yunus Seven, Senior Quality Engineer (automotive & aerospace). Audience: recruiters and hiring managers. Static HTML with embedded CSS and JavaScript—no build step required.

All content comes from Yunus's CV (`Yunus_Seven_CV_2026.pdf`). Keep the site factual: no invented metrics, testimonials or claims.

The site also has an anonymous traffic counter: the CV page shows visits in the last 30 days in the nav, and `/stats` shows the details (charts, sources, countries, devices). Yunus's own visits can be excluded per browser.

## Related Sites

- **Live site**: https://yunusseven.netlify.app/
- **Traffic stats**: https://yunusseven.netlify.app/stats
- **GitHub**: https://github.com/yunuseven138/yanni
- **Netlify account**: yunuseven138
- **LinkedIn**: https://www.linkedin.com/in/yunus-seven/
- **Calendly (30-min call)**: https://calendly.com/yunuseven138/30min

## Tech Stack

- **Framework**: Static HTML (no build step)
- **Styling**: Embedded CSS
- **JavaScript**: Vanilla JS, embedded
- **Hosting**: Netlify (Netlify Forms for the contact form)
- **Traffic counter**: Netlify Functions (serverless, not edge) + Netlify Blobs (`@netlify/blobs` 11.1.7, the only npm dependency; Netlify installs it from `package-lock.json`). Node 24 via `NODE_VERSION` in `netlify.toml` (`@netlify/blobs` 11 needs Node 22.12+; the functions runtime follows the build's Node version)
- **Charts**: Hand-written inline SVG in `stats.html` (no chart library)
- **Fonts**: Inter (Google Fonts CDN)

## File Structure

```
c:/YUNUS/AI/CLAUDE/
├── index.html              # The whole CV site (single page), incl. the visit counter + tracker
├── stats.html              # Traffic details page, served at /stats (noindex, no tracking)
├── 404.html                # Not-found page (served automatically by Netlify, no tracking)
├── yunus-seven.jpg         # Profile photo (hero portrait + og:image); initials shown if missing
├── Yunus_Seven_CV_2026.pdf # Downloadable CV; "Download CV" buttons hide if missing
├── netlify/
│   ├── edge-functions/
│   │   └── profile.ts      # JSON API: GET /api/profile and /api/profile/:section
│   ├── functions/
│   │   ├── traffic.mts     # Traffic API: /api/hit, /api/stats, /api/owner
│   │   └── traffic-cleanup.mts # Scheduled hourly: deletes expired salts/visitor hashes, rolls up finished months
│   └── lib/
│       └── traffic.mts     # Shared traffic logic; its header comment documents the storage layout
├── package.json            # npm dependency for the functions (@netlify/blobs)
├── package-lock.json
├── netlify.toml            # Netlify configuration (NODE_VERSION, headers, 404 rules hiding non-site files; no catch-all redirect)
├── .gitignore              # node_modules/, .netlify/, env files
├── CLAUDE.md               # This file
└── .netlify/               # Netlify local state (gitignored)
```

The publish directory is the repo root, so every file is downloadable unless `netlify.toml` hides it. Any new non-site file needs a `force = true`, `status = 404` redirect like the existing ones (`/netlify/*`, `/CLAUDE.md`, `/netlify.toml`, `/package.json`, `/package-lock.json`, `/node_modules/*`). Keep tools, tests and mocks out of the repo, and stage files by name when committing (not `git add -A`), so stray untracked files in the root never get published.

## Page Structure (index.html)

1. **Nav** — Logo, section anchors (Profile, Experience, Skills, Education, Contact), then at the top right the visit counter (`#visits`, links to `/stats`) and the Download CV button
2. **Hero** (`#top`) — Title, intro, Download CV / Get in touch, portrait (photo from the CV), 3 stat counters (8+ years, 2 industries, 4 languages)
3. **Companies** — "Where I've worked" strip (JLR, TEI, Birinci Automotive, Borusan Mannesmann)
4. **Profile** (`#profile`) — 3 summary cards (manufacturing, standards, data-driven problem solving)
5. **Experience** (`#experience`) — Timeline of `.job` cards; the current role has `.current`
6. **Skills** (`#skills`) — 6 `.skill-group` cards with `.chips`
7. **Education** (`#education`) — `.edu-item` list plus language bars (`--level` sets the width)
8. **Contact** (`#contact`) — Email, phone, LinkedIn, location, Calendly button, Netlify form
9. **Footer**

### Visit counter (nav)
- Hidden until `POST /api/hit` answers, then shows `last30.visits` (en-GB formatting) with an eye icon; stays hidden if the API fails. Its accessible name reads e.g. "1,234 visits in the last 30 days. View traffic details". Don't give it the `.counter` class (that's the hero's animated counters).
- Label by width: under 600px icon + number (under 360px the number is compact, e.g. "1.2k"; from 100,000 it's compact at every width, e.g. "123k"); 600–899px "N visits · last 30 days"; 900–1199px "N visits" (900–1023px also tighten the nav links' gap to 24px to make room); 1200px+ the full label.
- Where the label leaves out "last 30 days" (under 600px and 900–1199px), hovering or keyboard-focusing the counter shows a small tooltip, "Visits in the last 30 days" (`.visits-tip`, `aria-hidden`, because the link's `aria-label` already says it; don't use a `title`, which would repeat the name as its description).
- `.visits-slot` reserves the counter's width at every width (70px under 360px, 92px to 599px, 212px to 899px, 130px to 1023px, 140px to 1199px, 220px from 1200px; enough for "99,999"), so neither the links nor `.nav-actions` move when it appears. If the API fails, the slot just stays empty.
- Under 420px the nav Download CV button shows a download icon + "CV" ("Download" is visually hidden, so its accessible name is still "Download CV").

## Stats Page (stats.html, served at /stats)

Same look as the CV (dark, emerald, Inter, squared corners, same nav and footer); `<meta name="robots" content="noindex">`. Top to bottom:
1. **Nav** — logo → `/`, "Back to CV"
2. **Header** — title, lead, "Counting since …" (plus a "Test data" badge with `?ns=test`)
3. **Owner notice** — confirmation shown after `?owner=exclude|include`
4. **Toolbar** — range switcher (30 days / 90 days / 12 months / All time, kept in `?range=`), "Updated HH:MM UK time"
5. **Loading / error (with Try again) / empty** states — the empty state says "Counting started on <date>"
6. **Tiles** — visits, visitors ("daily visitors, summed"), CV downloads (all for the range), visits in the last 30 days ("refreshed every minute": `/api/stats` is CDN-cached for up to 60 s, so this tile can be a visit behind the nav counter, which is read right after the hit; don't label it as identical to the counter)
7. **Daily chart** — visits (area + line) and CV downloads (line) for the range; crosshair tooltip on hover/touch, arrow keys when focused (Shift = ±7 days, Home/End); "Show as a table" view. When a narrow chart has no room for the tooltip beside the point, it goes above or below the point instead (`clearOf()`; it may overlap the card heading but never goes under the fixed nav), so it never hides the point it describes
8. **Monthly chart** — visits per month, all time; columns with the peak labelled; same tooltip/keyboard/table pattern (Shift = ±12 months)
9. **Breakdowns** — sources, countries (names via `Intl.DisplayNames`, en-GB; top 7 + "Other countries"; "XX" = Unknown) and devices, as ranked horizontal bars with counts and shares
10. **How counting works** — plain-English privacy note, plus the "Don't count my visits on this browser" toggle and this browser's status

Rules: build the DOM with `textContent`/`createElement` only (never `innerHTML` with API data), validate every API value before use (look values up with an own-property check, so `?range=toString` falls back to 30 days), and keep charts readable from 320 to 1920px. `html { scroll-padding-top: 88px }` keeps the footer's `#how` link from landing under the fixed nav. Chart colours were checked for the dark surface (lightness band, colour-blind separation, contrast): visits `#059669` (hover `#10b981`), downloads `#6c56fc`. Text never takes a series colour.

## Traffic Counting

### What counts
- **Visit**: a load of the CV page by a real browser that runs JavaScript, from a browser that isn't excluded, by a visitor (IP + User-Agent) who hasn't loaded it in the previous 30 minutes. The window slides (every load refreshes it), so reloads never inflate the count.
- **Download**: a click on a Download CV link (`[data-cv]`), deduplicated per visitor with the same 30-minute rule, counted separately.
- **Visitors**: distinct visitors with at least one counted visit that day; totals over several days are sums of daily visitors.
- Days are Europe/London calendar days; "last 30 days" is today plus the previous 29.
- Bots never count: a missing User-Agent, or one matching bot/crawl/spider/headless/preview tools, link-preview bots, HTTP libraries, etc. (list in `netlify/lib/traffic.mts`).

### Tracker (index.html, `initTraffic()`)
- Exactly one `POST /api/hit` `{"type":"view"}` per page load (fetch with `keepalive`); the counter uses `last30.visits` from the response. A page Chrome prerenders in the background (`document.prerendering`) sends it only once it's actually opened (`prerenderingchange`).
- Download CV clicks send `{"type":"download"}` with `navigator.sendBeacon` (text/plain), falling back to fetch with `keepalive`; the download itself is never delayed.
- `ref` is only the referrer's scheme + host (no path or query ever leaves the browser).
- No tracking on `404.html` or `stats.html`.

### API (all JSON, `application/json; charset=utf-8`; storage failures return 500 `{"error": …}`)
| Endpoint | Purpose |
|----------|---------|
| `POST /api/hit` | Body `{"type": "view"\|"download", "ref"?: string, "owner"?: boolean}` (JSON or text/plain, ≤ 4096 bytes → else 413; bad JSON, unknown `type` or non-string `ref` → 400, nothing recorded). Returns `{"counted", "reason": "counted"\|"owner"\|"bot"\|"repeat", "last30": {"visits", "downloads"}}` (reason precedence owner, bot, repeat; `last30` is read after the hit is stored). Cross-origin → 403. `no-store`. |
| `GET /api/stats?range=30d\|90d\|12m\|all` | `timezone`, `generatedAt`, `trackingSince`, `range`, `last30`, `totals`, zero-filled `daily` (ends today) and `monthly` (all time), `countries`, `sources`, `devices` (non-zero, sorted). Browsers: `Cache-Control: public, max-age=0, must-revalidate`; CDN: `Netlify-CDN-Cache-Control: public, durable, s-maxage=60` with `Netlify-Vary: query=range\|ns`. Any other `range` → 400. |
| `GET /api/owner` | `{"excluded": boolean}` for this browser (from the cookie). |
| `POST /api/owner` | Body `{"exclude": boolean}`; sets or clears the `ys_owner` cookie. Cross-origin → 403. |

All three take `?ns=test` (any other `ns` → 400); a wrong method → 405. Source categories (the only ones ever exposed): Direct, LinkedIn, Search engines, Email & messaging, Job sites, Other websites. Hostnames are never exposed.

### Backend (`netlify/functions/*.mts` + `netlify/lib/traffic.mts`)
- **Functions**: `traffic.mts` serves the three routes (config methods GET and POST only, never HEAD). `traffic-cleanup.mts` is a scheduled function (`@hourly`), which Netlify runs on the published production deploy only. All logic is in `netlify/lib/traffic.mts`, with storage and the clock injected so it can be unit-tested. Serverless rather than edge because scheduled functions only exist as serverless functions, npm packages in edge functions are still beta, and the default function region sits next to the Blobs region.
- **Stores**: two site-wide Netlify Blobs stores, always opened with `consistency: "strong"`: `cv-traffic` (real data) and `cv-traffic-test` (`?ns=test`). Deploy previews and branch deploys always use `cv-traffic-test`, because site-wide stores are shared by every deploy and preview visits (mostly Yunus's, on a host without his cookie) must never reach the real numbers.
- **Keys** (days are Europe/London `YYYY-MM-DD`):
  - `salt/<day>`: `{"salt": "<64 hex>"}`, that day's random salt (crypto randomness, created once with a create-only write)
  - `seen/<day>/<sha256(salt|ip|ua)>/<v|d>-<ms>-<rand>`: one load (view or download) by one visitor; `<v|d>-claim-<previous load ms, or 0>` marks the load that was counted
  - `ev/<day>/v-<n|r>-<CC>-<dir|li|se|em|job|oth>-<desktop|mobile|tablet>-<32 hex>`: one counted visit; `n` = the visitor's first counted visit that day (these sum to "visitors")
  - `ev/<day>/d-<32 hex>`: one counted CV download
  - `agg/<YYYY-MM>`: `{"month", "days": {"<day>": {"v", "u", "d", "c": {country: n}, "s": {source: n}, "dev": {device: n}}}}`, the per-day totals of a finished month, kept forever
- **Hits never rewrite a key**: every write creates a new key with `onlyIfNew`, so concurrent hits can't lose each other's updates, and simultaneous loads from one visitor race for the same claim key and count once. An excluded browser (cookie or `"owner": true`) or a bot writes nothing at all, not even the daily salt. Just after midnight the 30-minute window also checks yesterday's loads (yesterday's salt is still there).
- **Reads**: `/api/stats` and `last30` list `ev/` and read `agg/`; once a month has an `agg/` document, readers use it instead of that month's events.
- **Clean-up** (`runMaintenance`): the hourly job runs it on both stores, and the hit that creates a day's salt also runs it in the background on its own store. It deletes the `salt/` and `seen/` keys of days that ended more than 30 minutes ago (so a salt or visitor hash lives about 25 hours, never more than 26), rolls each month up into `agg/<month>` once it has been over for an hour, and deletes that month's `ev/` keys from the 3rd of the next month.
- **Failures**: any storage error returns 500 `{"error": "Storage is unavailable"}`; after 25 s the request returns 500 `"Storage timed out"` while a visit that was already claimed finishes recording in the background.

### Privacy rules (non-negotiable)
- Normal visitors get no cookies and nothing in localStorage; the only exception is the opt-out flag for browsers that choose to be excluded.
- No raw IP addresses, User-Agents or referrer hostnames are stored. Repeat detection uses SHA-256(daily random salt + IP + User-Agent); salts come from crypto randomness, live server-side and are deleted, with the visitor hashes, within 48 hours (in practice the hourly clean-up removes them about 30 minutes after their day ends, so none lives more than about 26 hours).
- Only the source category, the country code (ISO alpha-2 or "XX") and the device type (desktop/mobile/tablet) are kept per visit. No city or region.
- The stats page explains this in plain English; keep that note accurate if the counting changes.

### Excluding Yunus's own visits
- One-click links (open them once on each browser/device):
  - Exclude: https://yunusseven.netlify.app/stats?owner=exclude
  - Count again: https://yunusseven.netlify.app/stats?owner=include
- Or use the "Don't count my visits on this browser" toggle on `/stats`, which also shows whether this browser is counted.
- Excluding sets a server cookie `ys_owner=1` (HttpOnly; Secure; SameSite=Lax; Path=/; 400 days, re-sent on every hit so it never lapses while in use) and a backup localStorage flag `ys_owner = "1"` (the tracker then sends `"owner": true`). Hits from an excluded browser never change any stored number, downloads included.

### Test data (`ns=test`)
- `?ns=test` uses a completely separate Blobs store (`cv-traffic-test`), so testing never touches real data. Any other `ns` value → 400. Deploy previews and branch deploys use the test store whatever the URL says.
- Pages forward it only when their own URL has it: `/?ns=test` posts to `/api/hit?ns=test` and its counter links to `/stats?ns=test`; `/stats?ns=test` reads `/api/stats?ns=test` and its links back to the CV keep `?ns=test`.
- Use `?ns=test` for any manual check against the live site.

## Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Black base | `#000000` | Background |
| Dark gray | `#0a0a0a`, `#111111` | Cards, alternate sections |
| Emerald primary | `#10b981` | Accents, CTAs |
| Emerald light | `#34d399` | Hover states |
| Emerald dark | `#059669` | Active states, gradients, chart "visits" series |
| Accent blue | `#0098f2` | Secondary accent |
| Accent purple | `#6c56fc` | Secondary accent, chart "CV downloads" series |
| Accent magenta | `#f200ca` | Secondary accent |
| Error | `#ff6363` | Form validation errors, error notices |

Emerald stays the primary colour. Secondary accents are for differentiation only (one per section, or one per card in a categorical grid such as the profile and skills cards), never CTAs. Use `.accent-blue` / `.accent-purple` / `.accent-magenta`; tints derive via `color-mix(in srgb, var(--accent) 16%, transparent)`.

### Typography
- **Font**: Inter, weights 300–800
- **Letter spacing**: -0.03em on headings

### Corner Radii
Squared aesthetic — no pills: `4px` / `6px` / `8px` (the stats toggle switch is squared too).

### Logo
Plain text: `Yunus Seven<span>.</span>` with the full stop in emerald.

## Interactive Features

- Scroll-triggered reveals (Intersection Observer), disabled under `prefers-reduced-motion` (CV and stats pages)
- Animated counters with easeOutQuart easing
- Cursor glow (desktop, hover-capable devices only)
- Scroll progress bar
- Download CV buttons hidden automatically if the PDF isn't deployed
- Visit counter in the nav (fades in once `/api/hit` answers) and anonymous view/download tracking
- Stats page: range switcher, SVG charts with hover/keyboard tooltips and table views, per-browser opt-out toggle

## Common Tasks

### Add a new job
Copy an `<article class="job">` in `#experience`, put it at the top, and move the `current` class and the `Current` tag to it.

### Update the CV PDF or photo
Replace `Yunus_Seven_CV_2026.pdf` / `yunus-seven.jpg` in the repo root (keep the filenames, or update every reference in `index.html`).

### Update the JSON API
`netlify/edge-functions/profile.ts` holds a copy of the CV content. Whenever you change a job, skill, education entry or contact detail in `index.html`, make the same change there.

### Add another Download CV link
Give it `data-cv` (and the `download` attribute): it's then hidden if the PDF is missing and its clicks are counted as downloads.

### Run locally
```bash
npm ci                       # @netlify/blobs for the functions (Node 22.12+)
netlify dev --offline        # http://localhost:8888: site, functions and a local Blobs sandbox
```
Open `http://localhost:8888/?ns=test` and `http://localhost:8888/stats?ns=test`. `netlify dev` never touches production data (its Blobs sandbox lives in `.netlify/blobs-serve`; delete that folder to reset it); don't log in, link or deploy from a test run. `netlify dev` and `netlify build` rewrite `.netlify/state.json` and `.netlify/netlify.toml` (gitignored). Real browsers are needed for the counter (Node's fetch sends `User-Agent: node`, and headless browsers are filtered as bots, so scripted tests must set a normal browser User-Agent).

## Deployment

If the Netlify site is connected to the GitHub repo, pushing to `main` deploys. To deploy manually:
```bash
netlify deploy --prod
```
Edge function and function configs may list only GET, POST, PUT, PATCH, DELETE and OPTIONS methods, never HEAD (a production deploy has failed on this before).

On every deploy Netlify installs the npm dependencies (`package.json` + `package-lock.json` are in the base directory) with the Node version from `NODE_VERSION` in `netlify.toml` (24), then bundles `netlify/functions/*.mts` with the shared lib and `@netlify/blobs`; the functions run on the same Node major version. Keep `@netlify/blobs` in `dependencies` (production builds set `NODE_ENV=production`, which skips devDependencies). The hourly clean-up only runs on the published production deploy. For a manual check after deploying, use `?ns=test` so only the test store changes.

## Notes

- Keep the single-file architecture for pages — no bundlers or build steps
- Maintain the squared corner aesthetic (no pills)
- Email and phone are published intentionally at Yunus's request
- The counter and stats must stay anonymous: no third-party analytics, no cookies for normal visitors
