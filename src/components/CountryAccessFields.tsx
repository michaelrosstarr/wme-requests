import { MultiSelect, Stack, Switch } from '@mantine/core'
import type { Country } from '@/lib/types'

interface Props {
  countries: Country[]
  isGlobal: boolean
  onIsGlobalChange: (v: boolean) => void
  countryIds: string[]
  onCountryIdsChange: (v: string[]) => void
  disabled?: boolean
  error?: string | null
}

export default function CountryAccessFields({
  countries,
  isGlobal,
  onIsGlobalChange,
  countryIds,
  onCountryIdsChange,
  disabled,
  error,
}: Readonly<Props>) {
  return (
    <Stack gap="xs">
      <Switch
        label="Global access (all countries)"
        checked={isGlobal}
        onChange={(e) => onIsGlobalChange(e.currentTarget.checked)}
        disabled={disabled}
      />
      {!isGlobal && (
        <MultiSelect
          label="Countries"
          placeholder="Select countries…"
          data={countries.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))}
          value={countryIds}
          onChange={onCountryIdsChange}
          disabled={disabled}
          error={error}
        />
      )}
    </Stack>
  )
}
