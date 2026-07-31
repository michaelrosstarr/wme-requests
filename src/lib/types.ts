export type RequestType = 'downlock' | 'imagery'
export type Status = 'pending' | 'in_progress' | 'completed' | 'rejected'
export type Platform = 'slack' | 'discord' | 'telegram' | 'email' | 'webhook' | 'google_sheets'
export type EventType = 'global' | 'downlock' | 'imagery'
export type CredentialType = 'google_service_account' | 'email_postmark' | 'email_mailgun' | 'email_smtp'

export interface Country {
  id: number
  name: string
  code: string
  created_at: string
}

export interface Region {
  id: number
  country_id: number
  name: string
  code: string
  created_at: string
}

export interface Channel {
  id: number
  country_id: number
  // null means the channel is country-wide; set means it only fires for that region's
  // requests (falling back to country-wide channels when a region has none — see
  // fireNotifications in src/lib/notifications.ts).
  region_id: number | null
  region_name?: string | null
  region_code?: string | null
  label: string
  platform: Platform
  event_type: EventType
  webhook_url: string | null
  bot_token: string | null
  chat_id: string | null
  custom_prefix: string | null
  email_to: string | null
  discord_forum: number
  spreadsheet_id: string | null
  sheet_name: string | null
  google_credential_id: number | null
  email_credential_id: number | null
}

export interface Credential {
  id: number
  type: CredentialType
  // NULL for the shared Google service-account pool; the owning user's id for email_* types.
  owner_user_id: string | null
  label: string
  // Non-secret identifier for display — client_email (Google) or the sending From address.
  display_identifier: string | null
  created_at: string
  updated_at: string
}

export interface RequestItem {
  id: number
  country_id: number
  region_id: number | null
  type: RequestType
  permalink: string
  lock_level: number | null
  editor_rank: number | null
  status: Status
  notes: string | null
  submitted_by: string | null
  created_at: string
  updated_at: string
  country_name: string
  country_code: string
  region_name: string | null
  region_code: string | null
  screenshot_key: string | null
}

export interface RequestsResponse {
  total: number
  limit: number
  offset: number
  data: RequestItem[]
}

export interface AdminUser {
  id: string
  name: string
  email: string
  emailVerified: number
  createdAt: string
  hasPassword: number
  isGlobal: number
  countryIds: number[]
}

export interface Me {
  userId: string
  isGlobal: boolean
  countryIds: number[]
}

export interface UserReportRow {
  submitted_by: string
  downlock_count: number
  imagery_count: number
  total: number
  majority_type: RequestType | 'tie'
}

export interface UserReportResponse {
  data: UserReportRow[]
}
