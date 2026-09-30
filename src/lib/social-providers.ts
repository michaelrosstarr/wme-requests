import { Gamepad2, type LucideIcon } from 'lucide-react'

// Client-safe registry of the OAuth providers offered on /login and /account. Adding a
// provider means an entry here plus its `socialProviders` + `trustedProviders` config (and
// secrets) in src/lib/auth.ts — both pages render straight from this list.
export const SOCIAL_PROVIDERS = [{ id: 'discord', label: 'Discord', icon: Gamepad2 }] as const satisfies readonly {
  id: string
  label: string
  icon: LucideIcon
}[]

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]['id']
