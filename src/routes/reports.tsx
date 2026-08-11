import { createFileRoute } from '@tanstack/react-router'
import { Badge, Container, Paper, Progress, Table, Text, Title } from '@mantine/core'
import { useUserReport } from '@/lib/queries'
import { TypeBadge, TYPE_COLORS, TYPE_LABELS, REQUEST_TYPE_LIST } from '@/lib/labels'

export const Route = createFileRoute('/reports')({ component: Reports })

const COL_SPAN = 3 + REQUEST_TYPE_LIST.length

function Reports() {
  const { data, isLoading, isError, error } = useUserReport()
  const rows = data?.data ?? []

  return (
    <Container size="xl" pb="xl">
      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="sm">
          Requests by User
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Every submitter with at least one request, broken down by type and whichever type they submit more of.
        </Text>

        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Total</Table.Th>
                {REQUEST_TYPE_LIST.map((t) => (
                  <Table.Th key={t}>{TYPE_LABELS[t]}</Table.Th>
                ))}
                <Table.Th>Split</Table.Th>
                <Table.Th>Majority Type</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={COL_SPAN}>
                    <Text c="dimmed" ta="center">
                      Loading…
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {isError && (
                <Table.Tr>
                  <Table.Td colSpan={COL_SPAN}>
                    <Text c="red" ta="center">
                      Error: {(error as Error).message}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isLoading && !isError && !rows.length && (
                <Table.Tr>
                  <Table.Td colSpan={COL_SPAN}>
                    <Text c="dimmed" ta="center">
                      No requests with a recorded username yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((r) => (
                <Table.Tr key={r.submitted_by}>
                  <Table.Td>{r.submitted_by}</Table.Td>
                  <Table.Td>{r.total}</Table.Td>
                  {REQUEST_TYPE_LIST.map((t) => (
                    <Table.Td key={t}>{r.counts[t]}</Table.Td>
                  ))}
                  <Table.Td style={{ minWidth: 120 }}>
                    <Progress.Root size="lg">
                      {REQUEST_TYPE_LIST.map((t) => (
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
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Container>
  )
}
