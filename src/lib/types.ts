export type RequestType = 'downlock' | 'imagery'
export type Status = 'pending' | 'in_progress' | 'completed' | 'rejected'
export type Platform = 'slack' | 'discord' | 'telegram' | 'email' | 'webhook'
export type EventType = 'global' | 'downlock' | 'imagery'

export interface Country {
  id: number
  name: string
  code: string
  created_at: string
}

export interface Channel {
  id: number
  country_id: number
  label: string
  platform: Platform
  event_type: EventType
  webhook_url: string | null
  bot_token: string | null
  chat_id: string | null
  custom_prefix: string | null
  email_to: string | null
}

export interface RequestItem {
  id: number
  country_id: number
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
}

export interface RequestsResponse {
  total: number
  limit: number
  offset: number
  data: RequestItem[]
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
