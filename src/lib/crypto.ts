import { env } from 'cloudflare:workers'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(env.CHANNEL_CREDENTIALS_KEY), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

// At-rest encryption for per-channel secrets stored in D1 (e.g. a Google service account
// key), using CHANNEL_CREDENTIALS_KEY (a 256-bit key, distinct from BETTER_AUTH_SECRET —
// see DEPLOYMENT.md). Format: "<iv-base64>.<ciphertext-base64>".
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`
}

export async function decryptSecret(stored: string): Promise<string> {
  const [ivB64, ciphertextB64] = stored.split('.')
  const key = await getKey()
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ciphertextB64),
  )
  return new TextDecoder().decode(plaintext)
}
