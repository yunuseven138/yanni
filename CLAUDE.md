# Yunus Seven — Personal CV Website

## Project Overview

Single-page personal CV website for Yunus Seven, Senior Quality Engineer (automotive & aerospace). Audience: recruiters and hiring managers. Static HTML with embedded CSS and JavaScript—no build step required.

All content comes from Yunus's CV (`Yunus_Seven_CV_2026.pdf`). Keep the site factual: no invented metrics, testimonials or claims.

## Related Sites

- **Live site**: https://yunusseven.netlify.app/
- **GitHub**: https://github.com/yunuseven138/yanni
- **Netlify account**: yunuseven138
- **LinkedIn**: https://www.linkedin.com/in/yunus-seven/
- **Calendly (30-min call)**: https://calendly.com/yunuseven138/30min

## Tech Stack

- **Framework**: Static HTML (no build step)
- **Styling**: Embedded CSS
- **JavaScript**: Vanilla JS, embedded
- **Hosting**: Netlify (Netlify Forms for the contact form)
- **Fonts**: Inter (Google Fonts CDN)

## File Structure

```
c:/YUNUS/AI/CLAUDE/
├── index.html              # The whole CV site (single page)
├── 404.html                # Not-found page (served automatically by Netlify)
├── yunus-seven.jpg         # Profile photo (hero portrait + og:image); initials shown if missing
├── Yunus_Seven_CV_2026.pdf # Downloadable CV; "Download CV" buttons hide if missing
├── netlify/
│   └── edge-functions/
│       └── profile.ts      # JSON API: GET /api/profile and /api/profile/:section
├── netlify.toml            # Netlify configuration (no catch-all redirect)
├── .gitignore
├── CLAUDE.md               # This file
└── .netlify/               # Netlify local state (gitignored)
```

## Page Structure (index.html)

1. **Nav** — Logo, section anchors (Profile, Experience, Skills, Education, Contact), Download CV button
2. **Hero** (`#top`) — Title, intro, Download CV / Get in touch, portrait (photo from the CV), 3 stat counters (8+ years, 2 industries, 4 languages)
3. **Companies** — "Where I've worked" strip (JLR, TEI, Birinci Automotive, Borusan Mannesmann)
4. **Profile** (`#profile`) — 3 summary cards (manufacturing, standards, data-driven problem solving)
5. **Experience** (`#experience`) — Timeline of `.job` cards; the current role has `.current`
6. **Skills** (`#skills`) — 6 `.skill-group` cards with `.chips`
7. **Education** (`#education`) — `.edu-item` list plus language bars (`--level` sets the width)
8. **Contact** (`#contact`) — Email, phone, LinkedIn, location, Calendly button, Netlify form
9. **Footer**

## Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Black base | `#000000` | Background |
| Dark gray | `#0a0a0a`, `#111111` | Cards, alternate sections |
| Emerald primary | `#10b981` | Accents, CTAs |
| Emerald light | `#34d399` | Hover states |
| Emerald dark | `#059669` | Active states, gradients |
| Accent blue | `#0098f2` | Secondary accent |
| Accent purple | `#6c56fc` | Secondary accent |
| Accent magenta | `#f200ca` | Secondary accent |
| Error | `#ff6363` | Form validation errors |

Emerald stays the primary colour. Secondary accents are for differentiation only (one per section, or one per card in a categorical grid such as the profile and skills cards), never CTAs. Use `.accent-blue` / `.accent-purple` / `.accent-magenta`; tints derive via `color-mix(in srgb, var(--accent) 16%, transparent)`.

### Typography
- **Font**: Inter, weights 300–800
- **Letter spacing**: -0.03em on headings

### Corner Radii
Squared aesthetic — no pills: `4px` / `6px` / `8px`.

### Logo
Plain text: `Yunus Seven<span>.</span>` with the full stop in emerald.

## Interactive Features

- Scroll-triggered reveals (Intersection Observer), disabled under `prefers-reduced-motion`
- Animated counters with easeOutQuart easing
- Cursor glow (desktop, hover-capable devices only)
- Scroll progress bar
- Download CV buttons hidden automatically if the PDF isn't deployed

## Common Tasks

### Add a new job
Copy an `<article class="job">` in `#experience`, put it at the top, and move the `current` class and the `Current` tag to it.

### Update the CV PDF or photo
Replace `Yunus_Seven_CV_2026.pdf` / `yunus-seven.jpg` in the repo root (keep the filenames, or update every reference in `index.html`).

### Update the JSON API
`netlify/edge-functions/profile.ts` holds a copy of the CV content. Whenever you change a job, skill, education entry or contact detail in `index.html`, make the same change there.

## Deployment

If the Netlify site is connected to the GitHub repo, pushing to `main` deploys. To deploy manually:
```bash
netlify deploy --prod
```

## Notes

- Keep the single-file architecture — no bundlers or build steps
- Maintain the squared corner aesthetic (no pills)
- Email and phone are published intentionally at Yunus's request
