# WME Requests

A full-stack tool for Waze Map Editor (WME) that lets editors send **downlock** and **imagery** requests for road segments. Requests are stored in **Cloudflare D1** (SQLite), delivered to **Slack**, **Discord**, and **Telegram**, and visualised in a built-in dashboard hosted on **Cloudflare Workers**.

---

## Architecture

| Layer | Technology |
|---|---|
| Userscript | Tampermonkey / Greasemonkey (runs inside WME) |
| App | TanStack Start (React, SSR, Vite) deployed as a Cloudflare Worker |
| API | TanStack Start server routes (`src/routes/api/**`), folded into the same Worker |
| Database | Cloudflare D1 (SQLite-compatible managed DB) |
| Dashboard | Mantine UI components rendered by TanStack Start (`src/routes/`, `src/components/`) |
| Auth | [Better Auth](https://better-auth.com) (email + password) via `better-auth-cloudflare`, sessions stored in D1 |
| Notifications | Outbound `fetch()` to Slack, Discord and Telegram webhooks/bots |

---

## Features

- **Two request types** — 🔒 Downlock and 🖼️ Imagery
- **Lock level inferred** automatically from the selected WME segment; editor can adjust before submitting
- **Multi-channel notifications** — each country can have:
  - A *global* channel (fires on every request)
  - Per-event-type channels (fires only for downlocks *or* only for imagery)
  - Unlimited channels per event type
- **Platforms**: Slack (Incoming Webhook), Discord (Webhook), Telegram (Bot API), Email (Postmark), generic Webhook (plain JSON POST for custom integrations)
- **Reports** — `/reports` breaks down requests by submitter, with a downlock/imagery split and each user's majority request type
- **Dashboard** — filterable table of all requests per country, inline status updates, and an admin panel to manage countries and notification channels

---

## Quick Start

> For a fuller walkthrough (including CORS config, migration reference, updating later, and troubleshooting), see [`DEPLOYMENT.md`](DEPLOYMENT.md).

### 1 — Prerequisites

```bash
npm install -g wrangler   # Cloudflare CLI
# Then authenticate:
wrangler login
```

### 2 — Clone & install

```bash
git clone https://github.com/michaelrosstarr/wme-requests.git
cd wme-requests
npm install
```

### 3 — Create the D1 database

```bash
npm run db:create
# The command prints a database_id — copy it into wrangler.jsonc:
#   "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 4 — Apply the schema

```bash
# Local development
npm run db:migrate:local

# Production (run once after deploy)
npm run db:migrate:remote
```

This applies every file under [`migrations/`](migrations/) that hasn't run yet — currently the app schema, auth schema, `editor_rank`, and `custom_prefix` migrations. See [`DEPLOYMENT.md`](DEPLOYMENT.md#4--apply-the-schema) for the full list.

### 5 — Configure the auth secret

```bash
# Local development — add to .dev.vars (already gitignored)
echo "BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" >> .dev.vars

# Production
wrangler secret put BETTER_AUTH_SECRET
```

### 6 — Create the first admin user

The dashboard has no public sign-up page — accounts are provisioned directly in D1:

```bash
node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name"
# Prints two INSERT statements; run them against your database:
wrangler d1 execute wme-requests --local  --command "$(node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name")"
wrangler d1 execute wme-requests --remote --command "$(node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name")"
```

### 7 — Local development

```bash
npm run dev
# Opens http://localhost:3000 — you'll be redirected to /login
```

### 8 — Deploy to Cloudflare Workers

```bash
npm run deploy
# After the first deploy, also push the DB migration to production:
npm run db:migrate:remote
```

Your app will be live at `https://<project>.<your-subdomain>.workers.dev`.

---

## Authentication

The dashboard (`/` and `/admin`) and nearly every API endpoint require a logged-in session (email + password via Better Auth). The one exception is `POST /api/requests` — that's the endpoint the Tampermonkey userscript calls cross-origin from `waze.com`, which has no way to complete an interactive login, so it stays open.

Sign-up is disabled at the API level (`disableSignUp: true` in `src/lib/auth.ts`), not just hidden from the UI — new accounts can only be created via [`scripts/create-admin-user.mjs`](scripts/create-admin-user.mjs) (see step 6 above).

---

## API Reference

All endpoints are under `/api/`. The dashboard and userscript both talk to this API. Every endpoint below requires a logged-in session **except `POST /api/requests`**, which is public (see [Authentication](#authentication)).

### Countries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/countries` | List all countries |
| POST | `/api/countries` | Create a country `{ name, code }` |
| GET | `/api/countries/:id` | Get a country |
| PUT | `/api/countries/:id` | Update `{ name?, code? }` |
| DELETE | `/api/countries/:id` | Delete (cascades to channels & requests) |

### Notification Channels

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/countries/:id/channels` | List channels for a country |
| POST | `/api/countries/:id/channels` | Add a channel (see body below) |
| PUT | `/api/channels/:id` | Update a channel |
| DELETE | `/api/channels/:id` | Delete a channel |
| POST | `/api/channels/:id/test` | Send a test notification to verify the channel is configured correctly |

**Channel body**

```json
{
  "label": "#wme-au-downlocks",
  "platform": "slack",
  "event_type": "downlock",
  "webhook_url": "https://hooks.slack.com/services/…",
  "custom_prefix": "L{lock_level}{country_code}"
}
```

`platform` is one of `slack` | `discord` | `telegram` | `email` | `webhook`. `event_type` is one of `global` | `downlock` | `imagery`.

- **Slack / Discord / generic Webhook** — use `webhook_url`.
- **Telegram** — use `bot_token` + `chat_id` instead of `webhook_url`.
- **Email** — use `email_to` (recipient address) instead of `webhook_url`; sent via [Postmark](https://postmarkapp.com) using the `POSTMARK_SERVER_TOKEN` secret and `POSTMARK_FROM_EMAIL` var (see [Environment Variables](#environment-variables)).

The generic `webhook` platform POSTs a plain JSON body (not platform-formatted) to `webhook_url`, for wiring up your own integrations:

```json
{
  "title": "Downlock Request — South Africa",
  "prefix": "L5ZA",
  "permalink": "https://www.waze.com/editor?...",
  "lock_level": 5,
  "notes": "Speed limit needs adjusting",
  "submitted_by": "waze_editor",
  "submitted_by_url": "https://www.waze.com/user/editor/waze_editor",
  "editor_rank": 4
}
```

`prefix`, `lock_level`, `notes`, `submitted_by`, `submitted_by_url`, and `editor_rank` are `null` when not applicable (e.g. `lock_level` for imagery requests).

`custom_prefix` (optional) is text prepended on its own line before the permalink in every message sent through that channel — for Discord it's sent in the message's `content` field (so `@mentions` inside it actually notify people), for Slack/Telegram it's the first line of the message text. It supports these variables, substituted per-request at send time:

| Variable | Resolves to |
|---|---|
| `{lock_level}` | The request's lock level (empty string for imagery requests) |
| `{country_code}` | The channel's country code, e.g. `ZA` |
| `{country_name}` | The channel's country name, e.g. `South Africa` |
| `{editor_rank}` | The submitter's WME editor rank |
| `{type}` | `downlock` or `imagery` |
| `{submitted_by}` | The submitter's Waze username |

Since channels are already split by `event_type`, this covers per-type formatting without conditionals — e.g. a `downlock` channel's prefix `L{lock_level}{country_code}` renders `L5ZA` for a lock-5 South Africa request, while an `imagery` channel can use a fixed prefix like `L5{country_code}` (or the literal `L5ZA`) since imagery requests have no lock level. Test a channel from the dashboard to preview the rendered prefix (sample values: `lock_level=3`, `editor_rank=3`, `submitted_by=TestUser`).

### Requests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/requests` | List requests (filters: `country_id`, `type`, `status`, `limit`, `offset`) |
| POST | `/api/requests` | Submit a request (see body below) |
| GET | `/api/requests/:id` | Get a request |
| PUT | `/api/requests/:id` | Update `{ status?, notes? }` |
| DELETE | `/api/requests/:id` | Delete a request |

**Request body**

```json
{
  "country_id": 1,
  "type": "downlock",
  "permalink": "https://www.waze.com/editor?…",
  "lock_level": 4,
  "notes": "Residential street locked too high",
  "submitted_by": "waze_username"
}
```

`lock_level` is `1–7` and applies to `downlock` requests only (inferred from the segment inside the userscript).

### Reports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports/by-user` | Requests grouped by `submitted_by`, with downlock/imagery counts and each user's majority type |

Backs the `/reports` dashboard page.

---

## Userscript Setup

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Greasemonkey) in your browser.
2. Open `userscript/wme-requests.user.js` and install it.
3. In WME, find the **WME Requests** tab in the sidebar.
4. Click **⚙** (settings) and enter your Cloudflare Workers URL, e.g. `https://your-project.your-subdomain.workers.dev`.
5. Select a segment on the map — the lock level is read automatically.
6. Choose a country and request type, then click **Submit**.

---

## Notification Examples

**Slack / Discord message**

> 🔒 **Downlock Request — Australia**
> Permalink: https://www.waze.com/editor?…
> Lock Level: 4
> Submitted by: waze_editor

**Telegram** — same content, formatted with MarkdownV2.

---

## Database Schema

```sql
countries            (id, name, code, created_at)
notification_channels(id, country_id, label, platform, event_type,
                      webhook_url, bot_token, chat_id, custom_prefix, email_to, created_at)
requests             (id, country_id, type, permalink, lock_level, editor_rank,
                      status, notes, submitted_by, created_at, updated_at)
```

See [`migrations/`](migrations/) for the full, incremental schema history.

---

## Environment Variables

Set these in `wrangler.jsonc` under `vars`:

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://waze.com,https://www.waze.com,https://beta.waze.com` | Comma-separated CORS allowlist, or `*` for any origin. Only the request's actual `Origin` header is echoed back if it exact-matches an entry — unlisted origins get no `Access-Control-Allow-Origin` header at all, which the browser treats as a CORS failure. This only affects cross-origin `fetch`/`XHR` calls (i.e. the public `POST /api/requests` endpoint called from a web page); it does **not** gate `GM_xmlhttpRequest` calls made by the userscript itself, since those are a browser-extension-privileged request type that bypasses CORS enforcement entirely — the restriction's real value is stopping an arbitrary website's client-side JS from posting fake requests through a visiting user's browser. |
| `POSTMARK_FROM_EMAIL` | — | The "From" address for `email`-platform notification channels. Must be a verified Sender Signature (or verified domain) in your Postmark account. |

Set as a secret, not a plain var (see [Configure the auth secret](#5--configure-the-auth-secret)):

| Secret | Description |
|---|---|
| `BETTER_AUTH_SECRET` | Signs and encrypts session cookies |
| `POSTMARK_SERVER_TOKEN` | Postmark Server API Token, used to send `email`-platform notifications |

Most per-channel notification credentials (Slack/Discord webhook URLs, Telegram bot token + chat ID, email recipient) are stored **in the database**, scoped to each channel. The two exceptions are `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM_EMAIL`, which are shared across all email channels and live in the environment instead, since they belong to your Postmark account/sending domain rather than to any one channel.

---

## License

MIT