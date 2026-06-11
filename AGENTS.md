# AGENTS.md

## Project overview

Pure static site for a Cloudflare Pages-based GitHub/Docker acceleration proxy landing page + Worker. Zero build step, zero dependencies — HTML + Tailwind CDN + vanilla JS.

## File structure

```
_worker.js          Cloudflare Pages Worker (proxy logic, auto-detected)
index.html          Landing page (hero, features, tabs, FAQ, CTA)
gh.html             GitHub acceleration page (URL generator, usage examples)
docker.html         Docker acceleration page (OS-specific config tabs)
docs.html           Deployment guide (5-step Cloudflare Pages setup)
assets/css/style.css  Shared styles (animations, keyframes, reduced-motion)
assets/js/main.js     Shared JS (tabs, copy buttons, auto-init on DOMContentLoaded)
assets/js/gh.js       GitHub page URL generator logic
assets/js/docker.js   Docker page OS tab switcher
assets/icons/         Reserved for icon SVGs (currently empty)
```

## Architecture notes

- **No build tooling.** Open any `.html` directly in a browser. No `package.json`, no `npm`.
- **Tailwind via CDN.** Every page loads `https://cdn.tailwindcss.com` and configures a custom `brand` color palette inline (`tailwind.config` block). Do not add Tailwind CLI or PostCSS unless the project switches away from CDN.
- **Fonts from Google Fonts CDN.** IBM Plex Sans (display) + JetBrains Mono (code). Linked via `<link>` in each `<head>`.
- **All icons are inline SVGs** (Lucide-style) — no icon library dependency.
- **Vanilla JS only.** No framework.
- **CSS/JS are now external.** Shared styles in `assets/css/style.css`, shared JS in `assets/js/main.js`. Each page also loads its own page-specific JS. When making changes to nav/footer/styling, update all four HTML files (content is still duplicated per page; only the shared wiring was extracted).

### _worker.js routing

Cloudflare Pages auto-detects `_worker.js` in the repo root. Routing logic:

| Request path | Behavior |
|---|---|
| `OPTIONS *` | Return 204 CORS preflight |
| `/v2/...` | Proxy to Docker Hub Registry API (`registry-1.docker.io`) |
| `/<image>` or `/<user>/<img>` | Docker pull path → parse & proxy to registry |
| `/<registry>/<path>` | If first segment is known registry (ghcr.io, quay.io, etc), proxy |
| `/https://...` or `/http://...` | Strip leading `/`, proxy to target URL |
| Everything else | `env.ASSETS.fetch(request)` — serve static file |

Key features:
- **Docker auth**: 401 → parse WWW-Authenticate → fetch token → retry with Bearer
- **S3 redirect re-proxy**: intercepts 302/307 from AWS S3/CDN, re-proxies through Worker (critical for China access)
- **S3 header patching**: auto-adds `x-amz-content-sha256` + `x-amz-date` for S3 requests
- **Allowed hosts**: `ALLOWED_HOSTS` array controls which upstreams can be proxied |

### JS class contracts

Shared JS (`main.js`) uses CSS class contracts:

- **Tabs**: Container must have class `tab-group`. Buttons must have `data-tab="<panel-id>"`. Panels must have `class="tab-panel"` and matching `id`.
- **Copy buttons**: Button must have class `copy-btn`. Its parent must have class `code-block` which contains a `<code>` child.

The `docker.js` tab switcher uses `docker-tab` / `docker-panel` classes (separate from generic tabs to avoid conflicts on the docker page).

### Design tokens

Custom Tailwind colors (set in `tailwind.config` block on every page):

| Token | Value | Tailwind class |
|-------|-------|---------------|
| Page background | `#0F172A` | `bg-brand-bg` |
| Card background | `#1E293B` | `bg-brand-card` |
| Hover / border | `#334155` | `bg-brand-hover` `border-brand-border` |
| Primary text | `#F8FAFC` | `text-brand-text` |
| Muted text | `#94A3B8` | `text-brand-muted` |
| Accent (green) | `#22C55E` | `text-brand-accent` `bg-brand-accent` |
| Accent hover | `#16A34A` | `bg-brand-accent-hover` |

## Site configuration

Edit `assets/js/config.js` to set the domain:

```js
window.CF_PROXY = {
  DOMAIN: 'your-domain.com',
};
```

`main.js` reads this at page load and auto-replaces all instances of `your-domain.com` in text nodes across the page. No manual find-and-replace needed. `gh.js` also reads from config (falls back to `location.hostname`).

## Pre-delivery checks

- Dark mode only (no light mode support).
- `prefers-reduced-motion` is respected via CSS override in `assets/css/style.css`.
- Responsive breakpoints: default (mobile) → `sm:` (640px) → `md:` (768px) → `lg:` (1024px).
- Copy buttons show a green checkmark SVG for 2 seconds after copying.
- When deploying: Cloudflare Pages build command = empty, output directory = `/`.
