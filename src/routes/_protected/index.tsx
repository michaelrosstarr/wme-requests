import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Camera, Trash2 } from 'lucide-react'
import { useCountries, useDeleteRequest, useDeleteRequests, useRequestStats, useRequests } from '@/lib/queries'
import { STATUS_OPTIONS, TypeBadge, fmtDate } from '@/lib/labels'

export const Route = createFileRoute('/_protected/')({ component: Dashboard })

const PAGE_SIZE = 50
const TYPE_OPTIONS = [
  { value: 'downlock', label: 'Downlock' },
  { value: 'imagery', label: 'Imagery' },
]

function Dashboard() {
  const [countryId, setCountryId] = useState<string | null>(null)
  const [type, setType] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [appliedFilter, setAppliedFilter] = useState<{
    countryId: string | null
    type: string | null
    status: string | null
  }>({ countryId: null, type: null, status: null })
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const countriesQuery = useCountries()
  const statsQuery = useRequestStats()
  const requestsQuery = useRequests({
    countryId: appliedFilter.countryId,
    type: appliedFilter.type,
    status: appliedFilter.status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const deleteRequest = useDeleteRequest()
  const deleteRequests = useDeleteRequests()

  const countries = countriesQuery.data ?? []
  const data = requestsQuery.data
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const allOnPageSelected = !!data?.data.length && data.data.every((r) => selectedIds.has(r.id))
  const someOnPageSelected = !allOnPageSelected && data?.data.some((r) => selectedIds.has(r.id))

  // Selection is page/filter-scoped — clear it whenever the visible rows change underneath it.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, appliedFilter])

  function applyFilters() {
    setPage(1)
    setAppliedFilter({ countryId, type, status })
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this request?')) return
    deleteRequest.mutate(id, {
      onError: (e) => notifications.show({ color: 'red', title: 'Failed to delete', message: (e as Error).message }),
    })
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!data) return
    setSelectedIds(allOnPageSelected ? new Set() : new Set(data.data.map((r) => r.id)))
  }

  function handleBulkDelete() {
    if (!selectedIds.size) return
    if (!confirm(`Delete ${selectedIds.size} selected request${selectedIds.size !== 1 ? 's' : ''}?`)) return
    deleteRequests.mutate([...selectedIds], {
      onSuccess: () => setSelectedIds(new Set()),
      onError: (e) => notifications.show({ color: 'red', title: 'Failed to delete', message: (e as Error).message }),
    })
  }

  return (
    <Container size="xl" pb="xl">
      <Paper withBorder p="md" radius="md" mb="md">
        <Title order={4} mb="sm">
          Filters
        </Title>
        <Group align="flex-end">
          <Select
            label="Country"
            placeholder="All countries"
            clearable
            data={countries.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))}
            value={countryId}
            onChange={setCountryId}
          />
          <Select label="Type" placeholder="All types" clearable data={TYPE_OPTIONS} value={type} onChange={setType} />
          <Select
            label="Status"
            placeholder="All statuses"
            clearable
            data={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
          />
          <Button onClick={applyFilters}>Apply</Button>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
        <StatCard label="Total" value={statsQuery.data?.total} />
        <StatCard label="Pending" value={statsQuery.data?.pending} />
        <StatCard label="In Progress" value={statsQuery.data?.inProgress} />
        <StatCard label="Completed" value={statsQuery.data?.completed} />
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Requests</Title>
          <Group gap="sm">
            {selectedIds.size > 0 && (
              <Button
                size="xs"
                color="red"
                variant="light"
                leftSection={<Trash2 size={14} />}
                loading={deleteRequests.isPending}
                onClick={handleBulkDelete}
              >
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            {data && (
              <Badge variant="light">
                {data.total} result{data.total !== 1 ? 's' : ''}
              </Badge>
            )}
          </Group>
        </Group>

        <Table.ScrollContainer minWidth={960}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 36 }}>
                  <Checkbox
                    aria-label="Select all requests on this page"
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onChange={toggleSelectAll}
                  />
                </Table.Th>
                <Table.Th>#</Table.Th>
                <Table.Th>Country</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Lock Level</Table.Th>
                <Table.Th>Editor Rank</Table.Th>
                <Table.Th>Permalink</Table.Th>
                <Table.Th>Submitted By</Table.Th>
                <Table.Th>Notes</Table.Th>
                {/* <Table.Th>Status</Table.Th> */}
                <Table.Th>Created</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {requestsQuery.isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={12}>
                    <Text c="dimmed" ta="center">
                      Loading…
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {requestsQuery.isError && (
                <Table.Tr>
                  <Table.Td colSpan={12}>
                    <Text c="red" ta="center">
                      Error: {(requestsQuery.error as Error).message}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {data && !data.data.length && (
                <Table.Tr>
                  <Table.Td colSpan={12}>
                    <Text c="dimmed" ta="center">
                      No requests found.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {data?.data.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Checkbox
                      aria-label={`Select request ${r.id}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </Table.Td>
                  <Table.Td>{r.id}</Table.Td>
                  <Table.Td>
                    {r.country_code}
                  </Table.Td>
                  <Table.Td>
                    <TypeBadge type={r.type} />
                  </Table.Td>
                  <Table.Td>{r.lock_level ?? '—'}</Table.Td>
                  <Table.Td>{r.editor_rank ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Anchor href={r.permalink} target="_blank" rel="noopener" size="sm">
                        Open ↗
                      </Anchor>
                      {r.screenshot_key && (
                        <ActionIcon
                          component="a"
                          href={`/api/screenshots/${r.screenshot_key}`}
                          target="_blank"
                          rel="noopener"
                          variant="light"
                          size="sm"
                          aria-label="View screenshot"
                          title="View screenshot"
                        >
                          <Camera size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{r.submitted_by || '—'}</Table.Td>
                  <Table.Td>{r.notes || '—'}</Table.Td>
                  {/* <Table.Td>
                    <Select
                      size="xs"
                      w={140}
                      data={STATUS_OPTIONS}
                      value={r.status}
                      onChange={(v) => handleStatusChange(r.id, v)}
                      allowDeselect={false}
                      aria-label="Status"
                    />
                  </Table.Td> */}
                  <Table.Td>
                    <Text size="xs">{fmtDate(r.created_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon color="red" variant="light" onClick={() => handleDelete(r.id)} aria-label="Delete">
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {totalPages > 1 && (
          <Group justify="center" mt="md" gap="xs">
            <Button variant="default" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Pagination total={totalPages} value={page} onChange={setPage} />
            <Button variant="default" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </Group>
        )}
      </Paper>
    </Container>
  )
}

function StatCard({ label, value }: Readonly<{ label: string; value?: number }>) {
  return (
    <Paper withBorder p="md" radius="md" ta="center">
      <Text size="xl" fw={700}>
        {value ?? '—'}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Paper>
  )
}
