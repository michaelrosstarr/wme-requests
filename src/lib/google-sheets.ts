export interface GoogleServiceAccount {
  client_email: string
  private_key: string
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// Cached per service account (channels may use different Google accounts) within the same
// Worker isolate — cheap win, and worst case (a cold isolate) just re-fetches a token.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getAccessToken(credentials: GoogleServiceAccount): Promise<string> {
  const cached = tokenCache.get(credentials.client_email)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const unsigned = [
    base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64url(
      JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  ].join('.')

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(credentials.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = `${unsigned}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`Google auth error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache.set(credentials.client_email, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
  return data.access_token
}

// Tracks which sheet tabs we've already confirmed have a header row, within this Worker
// isolate — avoids a read-before-write check on every single append.
const headeredSheets = new Set<string>()

async function ensureSheetHeader(token: string, spreadsheetId: string, tab: string, headers: string[]) {
  const cacheKey = `${spreadsheetId}:${tab}`
  if (headeredSheets.has(cacheKey)) return

  const range = encodeURIComponent(`${tab}!A1`)
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Google Sheets error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { values?: unknown[][] }

  if (!data.values?.length) {
    const putRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] }),
      },
    )
    if (!putRes.ok) throw new Error(`Google Sheets error ${putRes.status}: ${await putRes.text()}`)
  }
  headeredSheets.add(cacheKey)
}

// Appends a row to a Google Sheet via a service account, writing a header row first if the
// target tab is empty. The spreadsheet must be shared (Editor access) with the service
// account's client_email — see DEPLOYMENT.md.
export async function appendSheetRow(
  credentials: GoogleServiceAccount,
  spreadsheetId: string,
  sheetName: string | null,
  row: (string | number)[],
  headers: string[],
) {
  const token = await getAccessToken(credentials)
  const tab = sheetName?.trim() || 'Sheet1'
  await ensureSheetHeader(token, spreadsheetId, tab, headers)

  const range = encodeURIComponent(`${tab}!A1`)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    },
  )
  if (!res.ok) throw new Error(`Google Sheets error ${res.status}: ${await res.text()}`)
}
