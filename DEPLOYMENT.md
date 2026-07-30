# Deploying Your Own Instance

A complete walkthrough for standing up your own copy of WME Requests on Cloudflare — dashboard, API, database, and userscript all pointed at your own deployment.

---

## 1 — Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/sign-up) account (the free tier is enough)
- [Node.js](https://nodejs.org/) 18+ and npm
- The Wrangler CLI:

```bash
npm install -g wrangler
wrangler login
```

## 2 — Clone and install

```bash
git clone https://github.com/michaelrosstarr/wme-requests.git
cd wme-requests
npm install
```

## 3 — Create the D1 database

```bash
npm run db:create
```

This prints a `database_id`. Copy it into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "wme-requests",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // <- paste here
    "remote": true
  }
]
```

## 4 — Apply the schema

All migrations need to run, in order, against **both** your local dev database and the remote (production) one:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

This applies everything under [`migrations/`](migrations/):

| Migration | Adds |
|---|---|
| `0001_initial.sql` | Core schema — `countries`, `notification_channels`, `requests` |
| `0002_better_auth.sql` | Auth tables (sessions, accounts) for the dashboard login |
| `0003_editor_rank.sql` | `requests.editor_rank` — the submitter's WME editor rank |
| `0004_channel_custom_prefix.sql` | `notification_channels.custom_prefix` — the templated prefix feature |
| `0005_channel_email.sql` | `email`/`webhook` notification platforms + `notification_channels.email_to` |

You'll re-run `db:migrate:remote` any time you pull a future update that adds a new migration file — `wrangler d1 migrations apply` only applies migrations that haven't run yet, so it's always safe to re-run.

## 5 — Configure CORS (optional)

`wrangler.jsonc`'s `vars.ALLOWED_ORIGINS` restricts which cross-origin callers can hit the public `POST /api/requests` endpoint (the one the userscript calls from waze.com). It defaults to Waze's own domains:

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://waze.com,https://www.waze.com,https://beta.waze.com"
}
```

Leave this as-is unless you're doing something unusual — it doesn't need to include your own dashboard's domain (same-origin requests aren't subject to CORS in the first place).

## 6 — Configure the auth secret

```bash
# Local development — appended to .dev.vars (already gitignored)
echo "BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" >> .dev.vars

# Production — stored as an encrypted Worker secret, not a plain var
wrangler secret put BETTER_AUTH_SECRET
```

## 7 — Configure Postmark for email notifications (optional)

Only needed if you plan to use the `email` notification platform (skip this if you're only using Slack/Discord/Telegram/generic webhooks).

1. In your [Postmark](https://postmarkapp.com) account, verify a Sender Signature or domain to send from.
2. Set the from-address var in `wrangler.jsonc`:

   ```jsonc
   "vars": {
     "POSTMARK_FROM_EMAIL": "notifications@yourdomain.com"
   }
   ```

3. Set the Server API Token as a secret (never in `wrangler.jsonc`):

   ```bash
   # Local development — appended to .dev.vars (already gitignored)
   echo "POSTMARK_SERVER_TOKEN=your-real-token" >> .dev.vars

   # Production
   wrangler secret put POSTMARK_SERVER_TOKEN
   ```

4. Regenerate the Worker's env types after touching `wrangler.jsonc` or `.dev.vars`:

   ```bash
   npm run cf-typegen
   ```

## 8 — Create your admin account

There's no public sign-up page — sign-up is disabled at the API level, so the first (and every) account is provisioned directly in D1:

```bash
node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name"
```

This prints two `INSERT` statements. Run them against both databases:

```bash
wrangler d1 execute wme-requests --local  --command "$(node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name")"
wrangler d1 execute wme-requests --remote --command "$(node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name")"
```

## 9 — Try it locally

```bash
npm run dev
```

Open `http://localhost:3000` — you'll be redirected to `/login`. Sign in with the account from step 8, then set up at least one country and notification channel from the `/admin` page before moving on (see [README § Notification Channels](README.md#notification-channels) for the channel body fields and `custom_prefix` variables).

## 10 — Deploy

```bash
npm run deploy
```

This builds and pushes the Worker to Cloudflare. Your app is now live at `https://<project>.<your-subdomain>.workers.dev` (or a custom domain if you've attached one in the Cloudflare dashboard).

If this is your very first deploy and you haven't run step 4's `db:migrate:remote` yet, do that now — the deployed Worker needs the schema in place before it can serve any API requests.

## 11 — Point the userscript at your deployment

Open [`userscript/wme-requests.user.js`](userscript/wme-requests.user.js) and update:

```js
const DEFAULT_API_BASE = 'https://YOUR-PROJECT.YOUR-SUBDOMAIN.workers.dev';
```

Then install the script in Tampermonkey (or Greasemonkey). If you'd rather not edit the file, you can also leave the default as a placeholder and set the real URL later from inside WME: open the **WME Requests** panel → **Settings** → paste your Workers URL into **API Base URL** → **Save**. That value is stored per-browser via `GM_setValue`, so it persists across script updates without touching the file.

## 12 — Updating later

```bash
git pull
npm install
npm run db:migrate:local   # picks up any new migration files
npm run db:migrate:remote  # same, against production
npm run deploy
```

Since `wrangler d1 migrations apply` only runs migrations it hasn't seen before, this sequence is safe to repeat every time you pull updates, even if nothing changed.

---

## Troubleshooting

- **Userscript panel never appears / actions silently do nothing**: open the browser console and look for lines prefixed `[WME Requests]` — the script logs diagnostic info whenever it can't find something it expects from WME's own SDK (selection getter, country lookup, user info, etc.), rather than failing silently.
- **"Internal server error" on submit**: almost always a pending D1 migration — re-run `npm run db:migrate:remote`.
- **CORS errors in the browser console** (only relevant if you're calling the public endpoint from somewhere other than the userscript): check `ALLOWED_ORIGINS` in `wrangler.jsonc` includes the exact origin making the request, then redeploy — this var only takes effect on the next `wrangler deploy`.
