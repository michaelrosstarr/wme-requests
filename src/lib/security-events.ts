// Client-safe definitions for the account security log (see src/lib/security-activity.ts for
// the server side that records them, and the Account page for where they're shown).

export const SECURITY_EVENTS = {
  sign_in: { label: 'Signed in', notify: false },
  sign_in_failed: { label: 'Failed sign-in attempt', notify: false },
  password_changed: { label: 'Password changed', notify: true },
  passkey_added: { label: 'Passkey added', notify: true },
  passkey_removed: { label: 'Passkey removed', notify: true },
  two_factor_enabled: { label: 'Two-factor authentication turned on', notify: true },
  two_factor_disabled: { label: 'Two-factor authentication turned off', notify: true },
  totp_enabled: { label: 'Authenticator app added', notify: true },
  backup_codes_regenerated: { label: 'Backup codes regenerated', notify: true },
  security_key_added: { label: 'Security key added', notify: true },
  security_key_removed: { label: 'Security key removed', notify: true },
  account_linked: { label: 'Account connected', notify: true },
  account_unlinked: { label: 'Account disconnected', notify: true },
} as const

export type SecurityEventType = keyof typeof SECURITY_EVENTS

export interface SecurityEventDetail {
  /** Passkey / security key name. */
  name?: string | null
  /** OAuth provider id, e.g. "discord". */
  provider?: string
  /** How a sign-in happened, e.g. "password", "password + security key", "passkey", "discord". */
  method?: string
}

export interface SecurityEventRow {
  id: number
  event: SecurityEventType
  detail: SecurityEventDetail | null
  ip: string | null
  country: string | null
  user_agent: string | null
  created_at: string
}
