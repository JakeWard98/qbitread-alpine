# CLAUDE.md

## Project Overview

qBitRead is a lightweight, read-only Docker web application that monitors a qBittorrent instance. It provides a dark, minimal dashboard showing all torrents with live speeds, progress, ETA, and ratios. The app is **read-only by design** — it only monitors torrents; it never modifies, adds, or deletes them.

### Why This App Exists

Self-hosted qBittorrent users need a simple, secure way to glance at torrent status without exposing the full qBittorrent Web UI. qBitRead provides a locked-down, multi-user dashboard that proxies all communication through a backend, keeping qBittorrent credentials completely hidden from the browser.

## Documentation Maintenance

At the start or end of every task/chat in this repo, scan all Markdown files
(`CLAUDE.md`, `README.md`, and any other `*.md` files in the project) and update
any whose content is rendered inaccurate or incomplete by the changes made in
that session. If nothing needs updating, no action is required — but the review
itself is mandatory.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn (ASGI)
- **Frontend**: Alpine.js (CSP-friendly build, self-hosted), HTML5, CSS3 — no build step
- **Database**: SQLite via aiosqlite (raw async queries, no ORM)
- **HTTP Client**: httpx (async) for qBittorrent API calls
- **Auth**: JWT (PyJWT) + bcrypt password hashing
- **Container**: Alpine Linux (`python:3.12-alpine`), multi-stage build, non-root user
- **CI/CD**: GitHub Actions → GitHub Container Registry (GHCR), CodeQL static analysis (Python + JavaScript)

## Project Structure

```
app/                    # Backend (FastAPI)
  main.py               # App entry point, lifespan, page routes
  config.py             # Pydantic Settings (env var config)
  database.py           # aiosqlite connection, DB init, migrations
  middleware.py          # Security headers, CSRF, rate limiting
  auth/                 # Authentication module
    models.py           # User dataclass model
    security.py         # JWT creation/verification, password hashing
    router.py           # Auth API endpoints
    schemas.py          # Pydantic request/response models
    dependencies.py     # FastAPI dependencies (get_current_user, require_admin)
  qbit/                 # qBittorrent integration
    client.py           # QBitClient with circuit breaker pattern
    router.py           # /api/torrents, /api/transfer endpoints
    schemas.py          # Torrent/transfer Pydantic schemas
templates/              # HTML pages (index, login, setup, admin) using Alpine directives
static/
  js/                   # Alpine.js components
    shared.js           # Helpers (fmtBytes, CSRF, password validation) on window.qbr
    dashboard.js        # dashboardApp — torrent list, polling, filters, sort
    login.js            # loginApp — login form
    setup.js            # setupApp — first-run admin creation
    admin.js            # adminApp — user CRUD, qBit browser-auth, refresh-rate
    vendor/
      alpine-csp.min.js # Vendored Alpine.js CSP build (v3.14.9)
  css/style.css         # Dark theme with CSS variables
Dockerfile              # Alpine Linux multi-stage build
docker-compose.yml      # Production compose
.env.example            # Environment variable template
requirements.txt        # Python dependencies (pinned)
```

## Build & Run

```bash
# Development (no Docker)
pip install -r requirements.txt
export QBIT_PASSWORD=changeme ADMIN_PASSWORD=admin SECURE_COOKIES=false
uvicorn app.main:app --reload --port 8000

# Production (Docker)
cp .env.example .env    # Edit with your qBittorrent details
docker compose up -d    # Access at http://localhost:8112
```

## Architecture & Design Preferences

### Backend-as-Proxy

The backend is the **only** component that talks to qBittorrent. The browser never communicates with qBittorrent directly. All qBit API calls go through FastAPI endpoints that require authentication. This is the most critical architectural decision in the app.

```
Browser  -->  FastAPI (auth + proxy)  -->  qBittorrent API
              credentials here only
```

### Design Principles

- **Read-only**: The app monitors torrents. It does not add, pause, resume, or delete them. Do not add write operations to the qBittorrent API surface.
- **Alpine.js frontend (CSP build only)**: The frontend uses the [`@alpinejs/csp`](https://alpinejs.dev/advanced/csp) build, vendored at `static/js/vendor/alpine-csp.min.js`. This build avoids `new Function()`/`eval()` so the strict `script-src 'self'` CSP stays intact. **Do not** swap in the standard Alpine bundle — it would force `'unsafe-eval'` into the CSP and weaken XSS protection. The CSP build only resolves dot-separated property paths inside directives; complex logic must live in `Alpine.data()` methods/getters and be referenced by name.
- **No build step**: Alpine.js is vendored as a single minified file. No npm/webpack/rollup pipeline — JS is served as-is, same as before.
- **Async everywhere**: All backend I/O is async (httpx, aiosqlite). Do not introduce synchronous blocking calls.
- **Dark minimal UI**: The interface uses CSS variables for theming. The design is intentionally sparse — no unnecessary visual complexity.
- **Single-page feel**: Each page (dashboard, login, setup, admin) is a separate HTML template served by FastAPI, with one Alpine component handling its dynamic behavior. Not a true SPA — no client-side routing.
- **Pydantic for all validation**: Request/response schemas use Pydantic models. Config uses pydantic-settings.
- **Circuit breaker on qBit client**: The `QBitClient` (`app/qbit/client.py`) uses exponential backoff (10s to 300s) on failed logins and detects IP bans (15-minute pause). Respect this pattern when modifying the client.

## Security Requirements

**These are non-negotiable. Every change must preserve these guarantees.**

### Credential Isolation

- qBittorrent credentials (`QBIT_HOST`, `QBIT_USERNAME`, `QBIT_PASSWORD`) exist **only** on the backend. They must **never** appear in API responses, HTML templates, JavaScript, or any data sent to the browser.
- The sole documented exception is the opt-in `ENABLE_BROWSER_AUTH=true` feature: when explicitly enabled by the operator, `/api/qbit/browser-auth-creds` returns qBit credentials to an admin browser so the admin can POST a login to qBit from their own IP (used for IP-ban recovery). The endpoint returns 404 when the flag is false and the admin UI hides the form. Any future change here must keep this flag-gated invariant.
- The `SECRET_KEY` is auto-generated and persisted to `/app/data/.secret_key` with `0o600` permissions. It must never be logged or exposed. If the key cannot be persisted (e.g. volume permission error) the app fails fast on startup rather than silently using an ephemeral key that would invalidate every existing JWT.

### Authentication & Session Security

- JWT tokens are stored in **HTTP-only, SameSite=Strict** cookies. Never move tokens to localStorage, sessionStorage, or response bodies.
- When `SECURE_COOKIES=true`, cookies get the Secure flag (required behind HTTPS reverse proxy).
- JWT expiry is 12 hours by default (`JWT_EXPIRY_MINUTES=720`).
- Passwords are hashed with **bcrypt** (with salt). Never store or compare plaintext passwords.

### CSRF Protection

- Double-submit cookie pattern: CSRF token in cookie + `X-CSRF-Token` header on mutating requests.
- Exempt paths: `/api/auth/login`, `/api/auth/logout`, `/api/auth/setup` only.
- Do not add CSRF exemptions without careful consideration.

### Rate Limiting

- Login endpoint is rate-limited to 5 attempts per minute per IP (sliding window).
- Respects `X-Forwarded-For` for clients behind a reverse proxy.

### Security Headers

Applied via `SecurityHeadersMiddleware` in `app/middleware.py`:
- `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'` — plus `form-action 'self' <browser-origin>` and `frame-src 'self' <browser-origin>` appended when `QBIT_BROWSER_HOST` is set and passes origin validation.
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 0` (modern browsers; disables the legacy auditor)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — only set when `SECURE_COOKIES=true` (HSTS over HTTP would cause upgrade loops).

### Same-Origin Only

- No CORS headers are set. The app only accepts same-origin requests. Do not add CORS middleware unless explicitly required.

### Frontend CSP Build Constraint

- Always use `@alpinejs/csp` (vendored at `static/js/vendor/alpine-csp.min.js`). Replacing it with the standard build would require `'unsafe-eval'` in `script-src`, which is forbidden — that opens the door to XSS-driven code execution.
- All Alpine directives (`x-text`, `x-show`, `:class`, `@click`, etc.) must reference a single dot-separated property path on the component data. Computed values, formatted strings, and class lists belong in component methods/getters; the template is dumb on purpose.

### Docker Security

- Base image is `python:3.12-alpine` (musl libc, BusyBox userland) — smaller attack surface than Debian-slim.
- Container runs as non-root `appuser` (`/sbin/nologin` shell, created via Alpine's `addgroup -S` / `adduser -S`).
- Multi-stage build keeps `gcc`, `musl-dev`, `python3-dev`, `libffi-dev`, `binutils` in the builder stage only. The runtime image carries only the slimmed venv and the app.
- SQLite database and secret key persisted in `/app/data/` volume.

## Code Style & Patterns

- **No test framework** currently in the project.
- **Middleware order matters**: SecurityHeaders -> RateLimiting -> CSRF (applied in reverse in `main.py`).
- **Error handling**: qBit client returns structured error responses; frontend shows connection status indicator with error messages.
- **Frontend polling**: Dashboard polls `/api/torrents` and `/api/transfer` at a configurable interval (default 5 seconds, stored in `app_settings` DB table, adjustable via admin panel). On errors, it backs off exponentially up to 60 seconds.
- **Dependencies are pinned** in `requirements.txt`. Update versions deliberately.

## Environment Variables

All configuration is via environment variables. See `.env.example` for the full list with defaults. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `QBIT_PASSWORD` | Yes | qBittorrent password (server-side only) |
| `QBIT_HOST` | No | qBittorrent URL (default: `http://localhost:8080`) |
| `SECRET_KEY` | No | JWT signing key (auto-generated if not set) |
| `ADMIN_PASSWORD` | Recommended | Bootstrap admin password (setup wizard if omitted) |
| `SECURE_COOKIES` | No | Set `true` behind HTTPS proxy |
| `REFRESH_RATE` | No | Initial dashboard polling interval in seconds (default: `5`, range: 2–300). Seeds `app_settings` on first run only; admin panel value takes precedence on subsequent starts |
| `ENABLE_BROWSER_AUTH` | No | Opt-in admin feature (default: `false`). When true, `/api/qbit/browser-auth-creds` returns qBit credentials to the admin browser for IP-ban recovery. Off: endpoint returns 404 and the admin UI hides the form |

## CI/CD

Two GitHub Actions workflows live in `.github/workflows/`:

**`docker-release.yml`** — image publication:
- Triggers on GitHub release publication.
- Multi-platform builds: `linux/amd64`, `linux/arm64`.
- Pushes to GitHub Container Registry as `ghcr.io/<owner>/qbitread-alpine` (image name auto-derived from `${GITHUB_REPOSITORY,,}`).
- Semantic version tags: `1.2.3`, `1.2`, `1`, `latest` (or `beta` for pre-releases).

**`codeql.yml`** — static analysis:
- Triggers on pushes to `main`, PRs targeting `main`, and a weekly schedule.
- Scans Python and JavaScript with the `security-extended,security-and-quality` query suites.
- Results surface in the repo's Security → Code scanning tab.
