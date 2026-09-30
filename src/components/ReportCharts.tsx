import { Box, Group, Paper, Skeleton, Stack, Text, Title, Tooltip } from '@mantine/core'
import type { ReactNode } from 'react'
import { TYPE_COLORS, TYPE_LABELS } from '@/lib/labels'
import type { RequestType } from '@/lib/types'

// Stacking order for type-split charts. Colors follow each type everywhere in the app (see
// TYPE_COLORS); only the order differs from REQUEST_TYPE_LIST, so that no two segments that
// collide under red-green colorblindness (downlock red / accept green) ever sit side by side.
export const CHART_TYPE_ORDER: RequestType[] = ['downlock', 'uplock', 'accept_pur', 'imagery', 'decline_pur']

const BAR_HEIGHT = 14
const SEGMENT_GAP = 2
const LABEL_WIDTH = 150

export function ChartCard({ title, description, children }: Readonly<{ title: string; description?: string; children: ReactNode }>) {
  return (
    <Paper withBorder p="md" radius="md" h="100%">
      <Title order={5} mb={description ? 0 : 'md'}>
        {title}
      </Title>
      {description && (
        <Text size="xs" c="dimmed" mb="md">
          {description}
        </Text>
      )}
      {children}
    </Paper>
  )
}

export function StatTile({ label, value, loading }: Readonly<{ label: string; value: ReactNode; loading: boolean }>) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      {loading ? (
        <Skeleton height={28} width="60%" mt={6} />
      ) : (
        <Text fz={28} fw={700} lh={1.3} component="div">
          {value}
        </Text>
      )}
    </Paper>
  )
}

export function ChartSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <Stack gap={12}>
      {Array.from({ length: rows }, (_, i) => (
        <Group key={i} gap="sm" wrap="nowrap">
          <Skeleton height={12} width={LABEL_WIDTH - 20} />
          <Skeleton height={BAR_HEIGHT} width={`${Math.max(15, 75 - i * 9)}%`} />
        </Group>
      ))}
    </Stack>
  )
}

export function ChartEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text size="sm" c="dimmed" ta="center" py="lg">
      {children}
    </Text>
  )
}

function BarRow({ label, total, max, children }: Readonly<{ label: ReactNode; total: number; max: number; children: ReactNode }>) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Box w={LABEL_WIDTH} style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </Box>
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Box style={{ width: `${max ? (total / max) * 100 : 0}%`, minWidth: total ? 4 : 0 }}>{children}</Box>
        <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
          {total.toLocaleString()}
        </Text>
      </Group>
    </Group>
  )
}

// Single-series horizontal bars (magnitude), one hue. Rows arrive pre-sorted, largest first.
export function HorizontalBars({
  rows,
  color = 'blue',
  unit = 'requests',
}: Readonly<{ rows: { key: string | number; label: ReactNode; tooltip: string; value: number }[]; color?: string; unit?: string }>) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  return (
    <Stack gap={10}>
      {rows.map((r) => (
        <BarRow key={r.key} label={r.label} total={r.value} max={max}>
          <Tooltip label={`${r.tooltip}: ${r.value.toLocaleString()} ${unit}`} withArrow>
            <Box
              h={BAR_HEIGHT}
              bg={`var(--mantine-color-${color}-filled)`}
              style={{ borderRadius: '0 4px 4px 0', cursor: 'default' }}
            />
          </Tooltip>
        </BarRow>
      ))}
    </Stack>
  )
}

export function TypeLegend() {
  return (
    <Group gap="md" mb="md">
      {CHART_TYPE_ORDER.map((t) => (
        <Group key={t} gap={6} wrap="nowrap">
          <Box w={10} h={10} bg={`var(--mantine-color-${TYPE_COLORS[t]}-filled)`} style={{ borderRadius: 2 }} />
          <Text size="xs">{TYPE_LABELS[t]}</Text>
        </Group>
      ))}
    </Group>
  )
}

// Horizontal bars split into per-type segments (part-to-whole per row), separated by a 2px gap.
export function StackedTypeBars({
  rows,
}: Readonly<{ rows: { key: string | number; label: ReactNode; name: string; counts: Record<RequestType, number>; total: number }[] }>) {
  const max = Math.max(0, ...rows.map((r) => r.total))
  return (
    <Stack gap={10}>
      {rows.map((r) => {
        const segments = CHART_TYPE_ORDER.filter((t) => r.counts[t] > 0)
        return (
          <BarRow key={r.key} label={r.label} total={r.total} max={max}>
            <Group gap={SEGMENT_GAP} wrap="nowrap" h={BAR_HEIGHT}>
              {segments.map((t, i) => (
                <Tooltip
                  key={t}
                  withArrow
                  label={`${r.name} · ${TYPE_LABELS[t]}: ${r.counts[t].toLocaleString()} (${Math.round((r.counts[t] / r.total) * 100)}%)`}
                >
                  <Box
                    h="100%"
                    bg={`var(--mantine-color-${TYPE_COLORS[t]}-filled)`}
                    style={{
                      flexGrow: r.counts[t],
                      flexBasis: 0,
                      minWidth: 3,
                      cursor: 'default',
                      borderRadius: i === segments.length - 1 ? '0 4px 4px 0' : 0,
                    }}
                  />
                </Tooltip>
              ))}
            </Group>
          </BarRow>
        )
      })}
    </Stack>
  )
}
