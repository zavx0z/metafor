import type {ProviderBinding} from "@metafor/types/metafor/providers"
import type {BrowserPeerDescription} from "@zavx0z/provider-tech-peer/browser-types"

export const AGENT_BROWSER_PATH = "/agents/browser" as const
export const AGENT_BROWSER_RENEW_SCHEMA = "cosmos:agents/browser-renewal/v1" as const
export type AgentBrowserRenewal = {schema: typeof AGENT_BROWSER_RENEW_SCHEMA, version: 1, ticket: string, expiresAt: number}
export const AGENT_BROWSER_SCHEMA = "cosmos:agents/browser/v1" as const
export type AgentBrowserBootstrap = {
  schema: typeof AGENT_BROWSER_SCHEMA
  version: 1
  ticket: string
  expiresAt: number
  binding: ProviderBinding
  description: BrowserPeerDescription
  screenshotProvider?: boolean
  iceServers: Array<{urls: string | string[], username?: string, credential?: string}>
}
