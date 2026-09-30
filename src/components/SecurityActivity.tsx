import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Paper, ScrollArea, Table, Text, Tooltip } from '@mantine/core'
import { History } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { SECURITY_EVENTS, type SecurityEventRow } from '@/lib/security-events'
import { SOCIAL_PROVIDERS } from '@/lib/social-providers'
import TableLoadingRow from '@/components/TableLoadingRow'

export const SECURITY_ACTIVITY_KEY = ['auth', 'security-activity']

// Rough "Browser on OS" label — the full user agent is in the tooltip.
function describeDevice(ua: string | null) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}

function describeDetail(row: SecurityEventRow) {
  const d = row.detail
  if (!d) return null
  if (d.method) return `via ${SOCIAL_PROVIDERS.find((p) => p.id === d.method)?.label ?? d.method}`
  if (d.provider) return SOCIAL_PROVIDERS.find((p) => p.id === d.provider)?.label ?? d.provider
  if (d.name) return `"${d.name}"`
  return null
}

export default function SecurityActivity() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: SECURITY_ACTIVITY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.securityActivity()
      if (error) throw new Error(error.message ?? 'Could not load activity')
      return data
    },
  })

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb={4}>
        <History size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
        Recent security activity
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Sign-ins and changes to how you sign in. We also email you about changes. If something here wasn't you, change
        your password and review your sign-in methods above.
      </Text>
      {isError && (
        <Alert color="red" title="Could not load activity" mb="sm">
          {(error as Error).message}
        </Alert>
      )}
      <ScrollArea.Autosize mah={420}>
        <Table striped verticalSpacing={6} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Activity</Table.Th>
              <Table.Th>When</Table.Th>
              <Table.Th>Where</Table.Th>
              <Table.Th>Device</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isPending ? (
              <TableLoadingRow colSpan={4} />
            ) : !data?.length ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed">
                    No activity recorded yet.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              data.map((row) => {
                const detail = describeDetail(row)
                return (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      {row.event === 'sign_in_failed' ? (
                        <Badge color="red" variant="light" size="sm" mr={6}>
                          Failed
                        </Badge>
                      ) : null}
                      {SECURITY_EVENTS[row.event]?.label ?? row.event}
                      {detail && (
                        <Text span size="sm" c="dimmed">
                          {' '}
                          {detail}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleString()}</Table.Td>
                    <Table.Td>
                      {row.ip ?? '—'}
                      {row.country && (
                        <Text span size="sm" c="dimmed">
                          {' '}
                          ({row.country})
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label={row.user_agent ?? 'Unknown'} multiline maw={360} withArrow>
                        <Text span size="sm">
                          {describeDevice(row.user_agent)}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                )
              })
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Paper>
  )
}
