# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Project rebrand to `qbitread-alpine`.** Repo renamed; published image
  is now `ghcr.io/jakeward98/qbitread-alpine` (image name is auto-derived
  from `${GITHUB_REPOSITORY,,}` so the workflow needed no logic change).
  All hardcoded references in `docker-compose.yml`,
  `docker-compose.hardcoded.yml`, `.github/RELEASE_TEMPLATE.md`, and
  `README.md` updated. Same semver tag style preserved (`1.2.3`, `1.2`,
  `1`, `latest`, `beta` for pre-releases).
- **Frontend rewritten to Alpine.js (CSP build).** The four IIFE modules
  (`app.js`, `auth.js`, `setup.js`, `admin.js`) became four `Alpine.data()`
  components plus a shared helper module (`shared.js`). The vendored
  `@alpinejs/csp` v3.14.9 build (~46 KB) is self-hosted at
  `static/js/vendor/alpine-csp.min.js` — no external CDN, no `npm` build
  step. Strict `script-src 'self'` CSP is preserved (the CSP build avoids
  `new Function()`/`eval()`). UI, polling cadence, exponential backoff,
  IP-ban detection, sandboxed-iframe browser-auth flow, CSRF
  double-submit, and session-storage filter persistence all behave
  identically to the previous build.
- **Docker base swapped from `python:3.12-slim` to `python:3.12-alpine`.**
  Stage 1 now uses `apk add --no-cache gcc musl-dev python3-dev libffi-dev
  binutils`; stage 2 user creation uses Alpine's `addgroup -S` /
  `adduser -S`. `bcrypt 5.0.0` ships musllinux wheels for cp312 on amd64
  and aarch64, so multi-arch builds keep working without source
  compilation. No backend logic changes; the API surface, auth flow,
  middleware, circuit breaker, and database schema are untouched.

### Added
- **CodeQL workflow** (`.github/workflows/codeql.yml`). Scans Python and
  JavaScript on every push to `main`, every PR, and weekly. Uses the
  `security-extended,security-and-quality` query suites. Permissions
  scoped to `contents: read`, `security-events: write`, `actions: read`.
  Pinned to `github/codeql-action@68bde55…` (v4.35.4).

### Security
- **2026-05-04 dependency re-audit.** Third consecutive clean run.
  Manual GHSA / NVD cross-check across every pinned dep in
  `requirements.txt` (`fastapi 0.136.0`, `starlette>=0.49.1`,
  `uvicorn 0.44.0`, `httpx 0.28.1`, `PyJWT 2.12.1`, `bcrypt 5.0.0`,
  `aiosqlite 0.22.1`, `pydantic-settings 2.13.1`) returned **0 known
  vulnerabilities** at Critical/High/Moderate/Low. No new advisories
  affecting any pinned dep have been published in the week since the
  2026-04-27 re-audit. Confirmed:
  - `starlette>=0.49.1` still closes CVE-2025-62727 (FileResponse
    Range-header O(n²) DoS, High) and CVE-2025-54121 (multipart-parsing
    event-loop block on rollover-to-disk, Moderate; fixed upstream in
    0.47.2).
  - `PyJWT 2.12.1` still closes CVE-2026-32597 (`crit` header parameter
    not validated, High; fixed upstream in 2.12.0).
  No code changes required.
- **2026-04-27 dependency re-audit.** Second consecutive clean run of
  `pip-audit` and a manual GHSA cross-check across every pinned dep in
  `requirements.txt` (`fastapi 0.136.0`, `starlette>=0.49.1`,
  `uvicorn 0.44.0`, `httpx 0.28.1`, `PyJWT 2.12.1`, `bcrypt 5.0.0`,
  `aiosqlite 0.22.1`, `pydantic-settings 2.13.1`) — **0 known
  vulnerabilities** at Critical/High/Moderate/Low. No code changes
  required. Confirmed:
  - `starlette>=0.49.1` still closes CVE-2025-62727 (FileResponse
    Range-header O(n²) DoS).
  - `PyJWT 2.12.1` includes the fix for CVE-2026-32597 (`crit` header
    parameter not validated, High, fixed upstream in 2.12.0).
- **2026-04-20 dependency re-audit.** `pip-audit` (PyPI advisory service) and
  a manual GHSA cross-check of every pinned dep in `requirements.txt`
  (`fastapi 0.136.0`, `starlette>=0.49.1`, `uvicorn 0.44.0`, `httpx 0.28.1`,
  `PyJWT 2.12.1`, `bcrypt 5.0.0`, `aiosqlite 0.22.1`, `pydantic-settings
  2.13.1`) returned **0 known vulnerabilities** at Critical/High/Moderate/Low.
  No code changes required.
- Pinned `starlette>=0.49.1` to close CVE-2025-62727 (O(n²) DoS via `Range`
  header merging in `FileResponse`). qBitRead serves HTML templates via
  `FileResponse`, so the path was reachable.
- `/api/qbit/browser-auth-creds` is now gated behind the new
  `ENABLE_BROWSER_AUTH` environment variable (default `false`). When disabled,
  the endpoint returns 404 and the admin panel hides the Browser Auth form.
  Previously, any admin session could retrieve the qBit username + password
  in plaintext JSON — this silently contradicted the project's "credentials
  never leave the server" guarantee. Operators who need the feature for
  IP-ban recovery must now opt in explicitly.
- Fail-fast if `SECRET_KEY` cannot be persisted to disk. Previously, a
  filesystem or permission error caused silent fallback to an ephemeral
  in-memory key, invalidating every existing JWT on the next container
  restart with no operator signal.
- Pinned bcrypt work factor to `rounds=12` in both `hash_password()` and the
  timing-attack dummy hash. Prevents library default drift from silently
  changing the hashing cost.
- Disabled the OpenAPI schema endpoint (`/openapi.json`). `/docs` and `/redoc`
  were already disabled, but the underlying schema — which enumerates every
  admin-only endpoint — remained publicly readable.

### Added
- `ENABLE_BROWSER_AUTH` environment variable (see README env-var table).
- Docker Compose healthcheck probing `/login` — container now reports
  `healthy` / `unhealthy` via `docker inspect`. Also added to
  `docker-compose.hardcoded.yml`.
- `SECURITY.md` — supported versions, private disclosure process, threat
  model, operational recommendations.
- `CHANGELOG.md` — this file.

### Dependencies
- **2026-05-04 dependency refresh.** Bumped pinned deps to current PyPI
  latest. Resolver picks `starlette 1.0.0` transitively under the existing
  `>=0.49.1` floor (FastAPI 0.136.1 declares `starlette>=0.46.0`). Smoke
  test in clean venv: imports OK, uvicorn boots, `/login` returns 200,
  `/api/auth/login` issues JWT + CSRF cookies and emits all security
  headers, `/api/auth/me` round-trips with the cookie, `/api/torrents`
  returns the expected structured 502 when qBit is unreachable (circuit
  breaker path executes cleanly).
  - fastapi 0.136.0 → **0.136.1**
  - uvicorn 0.44.0 → **0.46.0**
  - pydantic-settings 2.13.1 → **2.14.0** (pulls in `typing-inspection>=0.4.0`)
  - starlette, httpx, PyJWT, bcrypt, aiosqlite already at latest
- fastapi 0.135.3 → **0.136.0**
- uvicorn 0.34.2 → **0.44.0**
- bcrypt 4.3.0 → **5.0.0** (API-compatible; `$2b$12$` hash prefix preserved)
- aiosqlite 0.20.0 → **0.22.1**
- pydantic-settings 2.7.1 → **2.13.1**
- httpx, PyJWT unchanged (already at latest)
- Smoke-tested: bcrypt roundtrip, JWT roundtrip, schema validation, SQLite
  roundtrip, full uvicorn boot, and endpoint/header checks all pass.

### Changed
- `CLAUDE.md`: Security Headers section now documents the actual CSP emitted
  by `app/middleware.py` (including `frame-ancestors 'none'` and the
  dynamically-added `form-action` / `frame-src` for `QBIT_BROWSER_HOST`), plus
  `X-XSS-Protection: 0` and the `Strict-Transport-Security` header that is
  only emitted when `SECURE_COOKIES=true`.
- `README.md`: credential-isolation bullet now notes the opt-in
  `ENABLE_BROWSER_AUTH` exception; IP-ban troubleshooting references the flag.
- `app/qbit/router.py`: the log line emitted when an admin retrieves
  browser-auth creds no longer includes the admin's username.
