import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiFetch from './api-client'
import type { AdminUser, Channel, Country, Me, RequestsResponse, Status, UserReportResponse } from './types'

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: () => apiFetch<Country[]>('/countries'),
  })
}

export function useUserReport() {
  return useQuery({
    queryKey: ['reports', 'by-user'],
    queryFn: () => apiFetch<UserReportResponse>('/reports/by-user'),
  })
}

export interface RequestsFilter {
  countryId: string | null
  type: string | null
  status: string | null
  limit: number
  offset: number
}

export function useRequests(filter: RequestsFilter) {
  const search = new URLSearchParams({ limit: String(filter.limit), offset: String(filter.offset) })
  if (filter.countryId) search.set('country_id', filter.countryId)
  if (filter.type) search.set('type', filter.type)
  if (filter.status) search.set('status', filter.status)

  return useQuery({
    queryKey: ['requests', filter],
    queryFn: () => apiFetch<RequestsResponse>(`/requests?${search}`),
  })
}

export function useRequestStats() {
  return useQuery({
    queryKey: ['requests', 'stats'],
    queryFn: async () => {
      const [all, pending, inProgress, completed] = await Promise.all([
        apiFetch<RequestsResponse>('/requests?limit=1'),
        apiFetch<RequestsResponse>('/requests?status=pending&limit=1'),
        apiFetch<RequestsResponse>('/requests?status=in_progress&limit=1'),
        apiFetch<RequestsResponse>('/requests?status=completed&limit=1'),
      ])
      return { total: all.total, pending: pending.total, inProgress: inProgress.total, completed: completed.total }
    },
  })
}

export function useUpdateRequestStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: number; status: Status }) =>
      apiFetch(`/requests/${vars.id}`, { method: 'PUT', body: JSON.stringify({ status: vars.status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })
}

export function useDeleteRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })
}

export function useDeleteRequests() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => apiFetch(`/requests/${id}`, { method: 'DELETE' }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })
}

export function useChannels(countryId: string | null) {
  return useQuery({
    queryKey: ['channels', countryId],
    queryFn: () => apiFetch<Channel[]>(`/countries/${countryId}/channels`),
    enabled: !!countryId,
  })
}

export function useCreateCountry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { name: string; code: string }) =>
      apiFetch('/countries', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['countries'] }),
  })
}

export function useUpdateCountry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: number; name: string; code: string }) =>
      apiFetch(`/countries/${vars.id}`, { method: 'PUT', body: JSON.stringify({ name: vars.name, code: vars.code }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['countries'] }),
  })
}

export function useDeleteCountry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/countries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['countries'] })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}

export interface ChannelFormValues {
  label: string
  platform: Channel['platform']
  event_type: Channel['event_type']
  webhook_url: string | null
  bot_token: string | null
  chat_id: string | null
  custom_prefix: string | null
  email_to: string | null
  discord_forum: boolean
  spreadsheet_id: string | null
  sheet_name: string | null
  // Write-only: leave blank on update to keep a channel's existing credentials — the
  // stored value is never sent back down to prefill this field (see ChannelFormModal).
  google_service_account_json?: string | null
}

export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { countryId: string } & ChannelFormValues) =>
      apiFetch(`/countries/${vars.countryId}/channels`, { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['channels', vars.countryId] }),
  })
}

export function useUpdateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: number; countryId: string } & ChannelFormValues) =>
      apiFetch(`/channels/${vars.id}`, { method: 'PUT', body: JSON.stringify(vars) }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['channels', vars.countryId] }),
  })
}

export function useDeleteChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: number; countryId: string }) => apiFetch(`/channels/${vars.id}`, { method: 'DELETE' }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['channels', vars.countryId] }),
  })
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/channels/${id}/test`, { method: 'POST' }),
  })
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<Me>('/me'),
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<AdminUser[]>('/users'),
  })
}

export interface UserAccessValues {
  isGlobal: boolean
  countryIds: number[]
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { name: string; email: string; password: string } & UserAccessValues) =>
      apiFetch('/users', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { name: string; email: string } & UserAccessValues) =>
      apiFetch('/users/invite', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${id}/reset-password`, { method: 'POST' }),
  })
}

export function useUpdateUserAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string } & UserAccessValues) =>
      apiFetch(`/users/${vars.id}/access`, {
        method: 'PUT',
        body: JSON.stringify({ isGlobal: vars.isGlobal, countryIds: vars.countryIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}
