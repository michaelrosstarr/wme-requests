import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Ban } from 'lucide-react'
import { useBlockedSubmitters, useMe, useUnblockSubmitter, useUserReport } from '@/lib/queries'
import { confirmDialog } from '@/lib/dialogs'
import BlockSubmitterModal from '@/components/BlockSubmitterModal'
import { TypeBadge, TYPE_COLORS, TYPE_LABELS } from '@/lib/labels'
import type { RequestType } from '@/lib/types'
import TableLoadingRow from '@/components/TableLoadingRow'
import {
  CHART_TYPE_ORDER,
  ChartCard,
  ChartEmpty,
  ChartSkeleton,
  HorizontalBars,
  StackedTypeBars,
  StatTile,
  TypeLegend,
} from '@/components/ReportCharts'

export const Route = createFileRoute('/_protected/reports')({
  component: Reports,
})

const COL_SPAN = 4 + CHART_TYPE_ORDER.length
const TOP_N = 10

function Reports() {
  // isPending (not isLoading) so the server-rendered HTML shows the loading state rather than
  // the empty state — the query only starts fetching once the page hydrates.
  const { data, isPending, isError, error } = useUserReport()
  const rows = data?.data ?? []
  const countries = data?.countries ?? []

  // Blocking is global-only (see src/lib/blocks.ts), so only global users get the Block column.
  const canBlock = !!useMe().data?.isGlobal
  const blockedByName = new Map((useBlockedSubmitters(canBlock).data ?? []).map((b) => [b.username.toLowerCase(), b]))
  const [blockUsername, setBlockUsername] = useState<string | null>(null)
  const unblockSubmitter = useUnblockSubmitter()
  const colSpan = COL_SPAN + (canBlock ? 1 : 0)

  async function handleUnblock(username: string) {
    const block = blockedByName.get(username.toLowerCase())
    if (!block) return
    const ok = await confirmDialog({
      title: 'Unblock submitter',
      message: `${block.username} will be able to submit requests again.`,
      confirmLabel: 'Unblock',
    })
    if (!ok) return
    unblockSubmitter.mutate(block.id, {
      onSuccess: () =>
        notifications.show({
          color: 'green',
          message: `Unblocked ${block.username}.`,
        }),
      onError: (e) =>
        notifications.show({
          color: 'red',
          title: 'Could not unblock',
          message: (e as Error).message,
        }),
    })
  }

  const typeTotals = Object.fromEntries(
    CHART_TYPE_ORDER.map((t) => [t, rows.reduce((sum, r) => sum + r.counts[t], 0)]),
  ) as Record<RequestType, number>
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)
  const typesBySize = [...CHART_TYPE_ORDER].sort((a, b) => typeTotals[b] - typeTotals[a])
  const topType = grandTotal ? typesBySize[0] : null

  const countryRows = countries.slice(0, TOP_N).map((c) => ({
    key: c.country_id,
    label: <Text size="sm">{c.country_name}</Text>,
    tooltip: c.country_name,
    value: c.total,
  }))
  const otherCountries = countries.slice(TOP_N)
  if (otherCountries.length) {
    const otherTotal = otherCountries.reduce((sum, c) => sum + c.total, 0)
    countryRows.push({
      key: -1,
      label: (
        <Text size="sm" c="dimmed">
          Other ({otherCountries.length})
        </Text>
      ),
      tooltip: `${otherCountries.length} other countries`,
      value: otherTotal,
    })
  }

  const empty = !isPending && !isError && !rows.length

  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        <div>
          <Title order={3}>Reports</Title>
          <Text size="sm" c="dimmed">
            All-time totals for requests with a recorded username, limited to the countries you can access.
          </Text>
        </div>

        {isError && (
          <Alert color="red" title="Could not load reports">
            {(error as Error).message}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <StatTile label="Total requests" loading={isPending} value={grandTotal.toLocaleString()} />
          <StatTile label="Contributors" loading={isPending} value={rows.length.toLocaleString()} />
          <StatTile label="Countries" loading={isPending} value={countries.length.toLocaleString()} />
          <StatTile label="Most common type" loading={isPending} value={topType ? <TypeBadge type={topType} /> : '—'} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <ChartCard title="Requests by type">
            {isPending ? (
              <ChartSkeleton rows={CHART_TYPE_ORDER.length} />
            ) : empty ? (
              <ChartEmpty>No data yet.</ChartEmpty>
            ) : (
              <HorizontalBars
                rows={typesBySize.map((t) => ({
                  key: t,
                  label: <TypeBadge type={t} />,
                  tooltip: TYPE_LABELS[t],
                  value: typeTotals[t],
                }))}
              />
            )}
          </ChartCard>

          <ChartCard title="Requests by country">
            {isPending ? (
              <ChartSkeleton />
            ) : empty ? (
              <ChartEmpty>No data yet.</ChartEmpty>
            ) : (
              <HorizontalBars rows={countryRows} />
            )}
          </ChartCard>
        </SimpleGrid>

        <ChartCard
          title="Top contributors"
          description={`The ${TOP_N} most active submitters, split by request type. Hover a segment for details.`}
        >
          {isPending ? (
            <ChartSkeleton rows={8} />
          ) : empty ? (
            <ChartEmpty>No requests with a recorded username yet.</ChartEmpty>
          ) : (
            <>
              <TypeLegend />
              <StackedTypeBars
                rows={rows.slice(0, TOP_N).map((r) => ({
                  key: r.submitted_by,
                  label: <Text size="sm">{r.submitted_by}</Text>,
                  name: r.submitted_by,
                  counts: r.counts,
                  total: r.total,
                }))}
              />
            </>
          )}
        </ChartCard>

        <Paper withBorder p="md" radius="md">
          <Title order={5}>All contributors</Title>
          <Text size="xs" c="dimmed" mb="md">
            Every submitter with at least one request, broken down by type and whichever type they submit more of.
          </Text>

          <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Total</Table.Th>
                  {CHART_TYPE_ORDER.map((t) => (
                    <Table.Th key={t}>{TYPE_LABELS[t]}</Table.Th>
                  ))}
                  <Table.Th>Split</Table.Th>
                  <Table.Th>Majority Type</Table.Th>
                  {canBlock && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {isPending && <TableLoadingRow colSpan={colSpan} />}
                {empty && (
                  <Table.Tr>
                    <Table.Td colSpan={colSpan}>
                      <Text c="dimmed" ta="center">
                        No requests with a recorded username yet.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {rows.map((r) => {
                  const isBlocked = blockedByName.has(r.submitted_by.toLowerCase())
                  return (
                    <Table.Tr key={r.submitted_by}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          {r.submitted_by}
                          {isBlocked && (
                            <Badge size="xs" color="red" variant="light">
                              Blocked
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>{r.total}</Table.Td>
                      {CHART_TYPE_ORDER.map((t) => (
                        <Table.Td key={t}>{r.counts[t]}</Table.Td>
                      ))}
                      <Table.Td style={{ minWidth: 120 }}>
                        <Progress.Root size="lg">
                          {CHART_TYPE_ORDER.map((t) => (
                            <Progress.Section key={t} value={(r.counts[t] / r.total) * 100} color={TYPE_COLORS[t]} />
                          ))}
                        </Progress.Root>
                      </Table.Td>
                      <Table.Td>
                        {r.majority_type === 'tie' ? (
                          <Badge color="gray" variant="light">
                            Tie
                          </Badge>
                        ) : (
                          <TypeBadge type={r.majority_type} />
                        )}
                      </Table.Td>
                      {canBlock && (
                        <Table.Td>
                          {isBlocked ? (
                            <Button size="xs" variant="subtle" onClick={() => handleUnblock(r.submitted_by)}>
                              Unblock
                            </Button>
                          ) : (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              leftSection={<Ban size={14} />}
                              onClick={() => setBlockUsername(r.submitted_by)}
                            >
                              Block
                            </Button>
                          )}
                        </Table.Td>
                      )}
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      </Stack>
      <BlockSubmitterModal opened={!!blockUsername} username={blockUsername} onClose={() => setBlockUsername(null)} />
    </Container>
  )
}
