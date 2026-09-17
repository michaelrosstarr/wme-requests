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
| `0006_user_country_access.sql` | `user.is_global` + `user_countries` — per-user country scoping |
| `0007_discord_forum_thread.sql` | `notification_channels.discord_forum` |
| `0008_google_sheets_channel.sql` | `google_sheets` platform + `spreadsheet_id`/`sheet_name` |
| `0009_request_screenshot.sql` | `requests.screenshot_key` |
| `0010_channel_google_credentials.sql` | (superseded by `0012`/`0013` below) |
| `0011_regions.sql` | `regions` — country-scoped states/provinces |
| `0012_credentials.sql` | `credentials` — the shared Google service-account pool + per-user BYOK email credentials |
| `0013_channel_credential_refs.sql` | `notification_channels.google_credential_id`/`email_credential_id`, replacing the old per-channel embedded credential |
| `0014_google_chat_channel.sql` | `google_chat` notification platform |
| `0015_push_subscriptions.sql` | `push_subscriptions` — self-service browser Web Push, independent of the channels above |
| `0016_ntfy_gotify_channels.sql` | `ntfy` and `gotify` notification platforms |

You'll re-run `db:migrate:remote` any time you pull a future update that adds a new migration file — `wrangler d1 migrations apply` only applies migrations that haven't run yet, so it's always safe to re-run.

## 5 — Configure CORS (optional)

`wrangler.jsonc`'s `vars.ALLOWED_ORIGINS` restricts which cross-origin callers can hit the public `POST /api/requests` endpoint (the one the userscript calls from waze.com). It defaults to Waze's own domains:

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://waze.com,https://www.waze.com,https://beta.waze.com"
}
```

Leave this as-is unless you're doing something unusual — it doesn't need to include your own dashboard's domain (same-origin requests aren't subject to CORS in the first place).

## 6 — Configure the auth secret and URL

```bash
# Local development — appended to .dev.vars (already gitignored)
echo "BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" >> .dev.vars

# Production — stored as an encrypted Worker secret, not a plain var
wrangler secret put BETTER_AUTH_SECRET
```

Also set `vars.BETTER_AUTH_URL` in `wrangler.jsonc` to your deployment's real origin (e.g.
`https://your-project.your-subdomain.workers.dev`, or a custom domain). It's used to build the
absolute links in invite and password-reset emails — without it those links would be bare paths
that don't work outside the app. `.dev.vars` already overrides it to `http://localhost:3000` for
local dev.

## 7 — Configure Postmark for system emails (optional)

This is only for the app's own transactional email — user invites and password resets (see
step 12). It's separate from the `email` notification platform, which is BYOK and configured per
user in the Credentials Manager (step 9) instead. Skip this step if you don't plan to invite
users by email (you can still create accounts directly via `create-admin-user.mjs`/**Admin**).

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

## 8 — Configure Discord sign-in (optional)

Lets users sign in with **Sign in with Discord** on the login page, in addition to
email/password. It never creates a brand-new account on its own — sign-up is still admin-only
(see step 12) — but if the Discord account's email matches an existing user, that user gets
signed in and the Discord account is linked to them automatically, no separate "link your
account" step required. Skip this step if you don't need it; the button still renders but fails
until configured.

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create a new
   application, then under **OAuth2 → General** add a redirect:

   ```
   https://your-project.your-subdomain.workers.dev/api/auth/callback/discord
   ```

   (or your custom domain, matching step 6's `BETTER_AUTH_URL` — for local dev, also add
   `http://localhost:3000/api/auth/callback/discord`).

2. Set the Client ID as a plain var in `wrangler.jsonc` (it's not secret — it's embedded in the
   browser authorize-URL anyway):

   ```jsonc
   "vars": {
     "DISCORD_CLIENT_ID": "your-client-id"
   }
   ```

3. Set the Client Secret as a secret (never in `wrangler.jsonc`):

   ```bash
   # Local development — appended to .dev.vars (already gitignored)
   echo "DISCORD_CLIENT_SECRET=your-real-secret" >> .dev.vars

   # Production
   wrangler secret put DISCORD_CLIENT_SECRET
   ```

4. Regenerate the Worker's env types after touching `wrangler.jsonc` or `.dev.vars`:

   ```bash
   npm run cf-typegen
   ```

## 9 — Configure the Credentials Manager (optional)

**Admin → Credentials** holds two kinds of reusable, encrypted-at-rest credential that
notification channels reference instead of embedding a secret directly:

- **Google Service Accounts** — a shared pool. Add one and reuse it across as many
  `google_sheets` channels as you like; only global users can add or remove them.
- **Email Credentials** — BYOK. Each user adds their own Postmark, Mailgun, or SMTP
  credential, and picks it when configuring an `email` notification channel. A non-global user
  only sees their own; global users see everyone's.

Skip this step if you're not using the `google_sheets` or `email` notification platforms.

1. Set `CHANNEL_CREDENTIALS_KEY`, a random 256-bit key used to encrypt every credential in D1:

   ```bash
   # Local development — appended to .dev.vars (already gitignored)
   echo "CHANNEL_CREDENTIALS_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" >> .dev.vars

   # Production — stored as an encrypted Worker secret, not a plain var
   wrangler secret put CHANNEL_CREDENTIALS_KEY
   ```

   Regenerate the Worker's env types after adding it:

   ```bash
   npm run cf-typegen
   ```

2. **For Google Sheets:** in the [Google Cloud Console](https://console.cloud.google.com/),
   create a service account and download its JSON key file, with the **Google Sheets API**
   enabled for that project. Share the target spreadsheet with the service account's
   `client_email` (Editor access) — otherwise appends will fail with a permission error. In
   **Admin → Credentials**, add a **Google Service Account** credential and paste the full
   contents of the downloaded JSON key file — it's encrypted before being stored and isn't
   shown again after saving. Then, when adding/editing a `google_sheets` channel, pick it from
   the **Google Service Account** dropdown (and paste the spreadsheet ID from the sheet's URL,
   the segment between `/d/` and `/edit`).
3. **For email:** in **Admin → Credentials**, add an **Email Credential** with whichever
   provider you use — a Postmark server token, a Mailgun API key + sending domain, or SMTP
   host/port/username/password. Then, when adding/editing an `email` channel, pick it from the
   **Email Credential** dropdown. SMTP sends over a raw TCP connection (via
   [`worker-mailer`](https://www.npmjs.com/package/worker-mailer)) on port 587 or 465 — port 25
   isn't reachable from Workers.

## 10 — Configure Web Push notifications (optional)

Unlike the channels above, Web Push isn't admin-configured — any signed-in user can click
**Notify me** on the dashboard to subscribe their own browser to a country (optionally scoped to
a region and request type). Skip this step if you don't need browser push notifications.

1. Generate a VAPID key pair with the bundled CLI from
   [`@pushforge/builder`](https://www.npmjs.com/package/@pushforge/builder) (already a project
   dependency — no separate install needed):

   ```bash
   npx @pushforge/builder vapid
   ```

   This prints a public key and a private key in JWK format.

2. Set the private key as a secret (never in `wrangler.jsonc`):

   ```bash
   # Local development — appended to .dev.vars (already gitignored) as the raw JSON string
   echo 'WEB_PUSH_VAPID_PRIVATE_JWK={"alg":"ES256",...}' >> .dev.vars

   # Production
   wrangler secret put WEB_PUSH_VAPID_PRIVATE_JWK
   ```

3. Set the public key and a contact address as plain vars in `wrangler.jsonc` (the public key is
   safe to expose — it's sent to the browser as `applicationServerKey`):

   ```jsonc
   "vars": {
     "WEB_PUSH_VAPID_PUBLIC_KEY": "your-public-key-here",
     "WEB_PUSH_CONTACT": "mailto:you@example.com"
   }
   ```

4. Regenerate the Worker's env types and re-migrate for `push_subscriptions`:

   ```bash
   npm run cf-typegen
   npm run db:migrate:local
   npm run db:migrate:remote
   ```

## 11 — Configure Cloudflare Turnstile (optional but recommended)

Guards the sign-in and forgot-password forms against bots/credential-stuffing with a free
Cloudflare Turnstile widget (via Better Auth's built-in `captcha` plugin — see
`src/lib/auth.ts`). The button/form still work without it — the widget only renders, and the
server only requires a token, once `VITE_PUBLIC_TURNSTILE_SITE_KEY` is set — but running
public login/reset forms without it isn't recommended.

1. Create a widget for your domain (add `--domain localhost` too if you want it in local
   dev) with either the [Turnstile dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
   or Wrangler:

   ```bash
   npx wrangler turnstile widget create "Your App Login" \
     --domain your-project.your-subdomain.workers.dev --domain localhost --mode managed
   ```

   This prints a `sitekey` (public) and a `secret` (private).

2. Set the site key as a client-bundled var in `.env` (not `wrangler.jsonc` — it's baked in
   at `vite build` time, same as `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`):

   ```bash
   echo "VITE_PUBLIC_TURNSTILE_SITE_KEY=your-site-key" >> .env
   ```

3. Set the secret key as a Worker secret (never in `wrangler.jsonc` or `.env`):

   ```bash
   # Local development — appended to .dev.vars (already gitignored)
   echo "TURNSTILE_SECRET_KEY=your-real-secret" >> .dev.vars

   # Production
   wrangler secret put TURNSTILE_SECRET_KEY
   ```

4. Regenerate the Worker's env types after touching `.dev.vars`:

   ```bash
   npm run cf-typegen
   ```

## 12 — Create your first admin account

There's no public sign-up page — sign-up is disabled at the API level. The very first account has
to be provisioned directly in D1:

```bash
node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name"
```

This prints two `INSERT` statements. Run them against both databases:

```bash
wrangler d1 execute wme-requests --local  --command "$(node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name")"
wrangler d1 execute wme-requests --remote --command "$(node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name")"
```

Every account after that can be managed from **/admin → Users** in the dashboard once you're
signed in: **Create** sets a password directly, **Invite** emails a link (via Postmark, see step 7)
letting the person set their own password, and **Reset Password** re-sends that same link to an
existing user. Invite/reset emails require step 7's Postmark config and step 6's `BETTER_AUTH_URL`.

## 13 — Try it locally

```bash
npm run dev
```

Open `http://localhost:3000` — the dashboard and `/requests` are viewable without signing in
(read-only), but `/admin` and `/reports` redirect to `/login`. Sign in with the account from
step 12, then set
up at least one country and notification channel from the `/admin` page before moving on (see
[README § Notification Channels](README.md#notification-channels) for the channel body fields
and `custom_prefix` variables).

## 14 — Deploy

```bash
npm run deploy
```

This builds and pushes the Worker to Cloudflare. Your app is now live at `https://<project>.<your-subdomain>.workers.dev` (or a custom domain if you've attached one in the Cloudflare dashboard).

If this is your very first deploy and you haven't run step 4's `db:migrate:remote` yet, do that now — the deployed Worker needs the schema in place before it can serve any API requests.

## 15 — Point the userscript at your deployment

Open [`userscript/wme-requests.user.js`](userscript/wme-requests.user.js) — the built script Tampermonkey actually installs — and update:

```js
const DEFAULT_API_BASE = 'https://YOUR-PROJECT.YOUR-SUBDOMAIN.workers.dev';
```

Then install the script in Tampermonkey (or Greasemonkey). If you'd rather not edit the file, you can also leave the default as a placeholder and set the real URL later from inside WME: open the **WME Requests** panel → **Settings** → paste your Workers URL into **API Base URL** → **Save**. That value is stored per-browser via `GM_setValue`, so it persists across script updates without touching the file.

The script's source is TypeScript, at [`userscript/src/main.user.ts`](userscript/src/main.user.ts) — see [`userscript/README.md`](userscript/README.md) for the build. If you've set that up and plan to keep rebuilding, edit `DEFAULT_API_BASE` there instead: `npm run build` regenerates `userscript/wme-requests.user.js` and would overwrite an edit made directly in the built file.

## 16 — Updating later

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
