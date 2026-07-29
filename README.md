# WME Requests

A full-stack tool for Waze Map Editor (WME) that lets editors send **downlock** and **imagery** requests for road segments. Requests are stored in **Cloudflare D1** (SQLite), delivered to **Slack**, **Discord**, and **Telegram**, and visualised in a built-in dashboard hosted on **Cloudflare Pages**.

---

## Architecture

| Layer | Technology |
|---|---|
| Userscript | Tampermonkey / Greasemonkey (runs inside WME) |
| API | Cloudflare Pages Functions (`functions/api/[[route]].js`) |
| Database | Cloudflare D1 (SQLite-compatible managed DB) |
| Dashboard | Static HTML/CSS/JS served by Cloudflare Pages (`public/`) |
| Notifications | Outbound `fetch()` to Slack, Discord and Telegram webhooks/bots |

---

## Features

- **Two request types** — 🔒 Downlock and 🖼️ Imagery
- **Lock level inferred** automatically from the selected WME segment; editor can adjust before submitting
- **Multi-channel notifications** — each country can have:
  - A *global* channel (fires on every request)
  - Per-event-type channels (fires only for downlocks *or* only for imagery)
  - Unlimited channels per event type
- **Platforms**: Slack (Incoming Webhook), Discord (Webhook), Telegram (Bot API)
- **Dashboard** — filterable table of all requests per country, inline status updates, and an admin panel to manage countries and notification channels

---

## Quick Start

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
# The command prints a database_id — copy it into wrangler.toml:
#   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 4 — Apply the schema

```bash
# Local development
npm run db:migrate:local

# Production (run once after deploy)
npm run db:migrate:remote
```

### 5 — Local development

```bash
npm run dev
# Opens http://localhost:8788
```

### 6 — Deploy to Cloudflare Pages

```bash
npm run deploy
# After the first deploy, also push the DB migration to production:
npm run db:migrate:remote
```

Your app will be live at `https://<project>.pages.dev`.

---

## API Reference

All endpoints are under `/api/`. The dashboard and userscript both talk to this API.

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

**Channel body**

```json
{
  "label": "#wme-au-downlocks",
  "platform": "slack",
  "event_type": "downlock",
  "webhook_url": "https://hooks.slack.com/services/…"
}
```

For Telegram use `bot_token` + `chat_id` instead of `webhook_url`.  
`event_type` is one of `global` | `downlock` | `imagery`.

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

---

## Userscript Setup

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Greasemonkey) in your browser.
2. Open `userscript/wme-requests.user.js` and install it.
3. In WME, find the **WME Requests** tab in the sidebar.
4. Click **⚙** (settings) and enter your Cloudflare Pages URL, e.g. `https://your-project.pages.dev`.
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
                      webhook_url, bot_token, chat_id, created_at)
requests             (id, country_id, type, permalink, lock_level,
                      status, notes, submitted_by, created_at, updated_at)
```

See [`migrations/0001_initial.sql`](migrations/0001_initial.sql) for the full schema.

---

## Environment Variables

Set these in `wrangler.toml` under `[vars]`:

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins (comma-separated or `*`) |

Sensitive values (like notification credentials) are stored **in the database**, not as environment variables.

---

## License

MIT