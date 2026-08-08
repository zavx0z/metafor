export const DOMAIN_HEALTH_READ_METHOD = "domain.health.read" as const
export const DARK_FORCE_STATUS_READ_METHOD = "dark.force.status.read" as const

export type DomainHealth = {
  ok: boolean
  domain: string
  rpc: string
  error: string | null
  initialized?: boolean
  backend?: string
  database?: string
}

export type DarkForceStatus = {
  state: string
  connectedDomains: string[]
  error: string | null
}
