import { Center, Loader, Table } from '@mantine/core'

export default function TableLoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Center py="md">
          <Loader size="sm" />
        </Center>
      </Table.Td>
    </Table.Tr>
  )
}
