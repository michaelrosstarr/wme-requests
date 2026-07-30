export default async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (res.status === 204) return null as T
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || 'API error')
  return data
}
