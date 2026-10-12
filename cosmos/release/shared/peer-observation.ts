/** Ограниченная неканоническая transport telemetry; [владелец](../README.md#наблюдение-сетей-участников). */
export const PEER_OBSERVATION_SCHEMA = "cosmos:peer-network-observation/v1"
export const DOMAIN_OBSERVATION_SCHEMA = "cosmos:domain-transport-observation/v1"
export const PEER_OBSERVATION_CHANNEL = "cosmos:peer-observation:v1"
export const PEER_OBSERVATION_TTL_MS = 10_000
export type ObservedDomain = "dark" | "boundary" | "matrix" | "energy"
export type ObservedTransport = "direct" | "relay" | "websocket"
export type ObservedChannelState = "connecting" | "open" | "closed" | "unknown"

/** Producer сообщает только собственную живую incarnation. Native DC open отличается от hydrated readiness. */
export interface DomainTransportReport {
  schema: typeof DOMAIN_OBSERVATION_SCHEMA
  producerId: string
  seq: number
  observedAt: number
  domains: {name: ObservedDomain; state: "starting" | "running" | "closed" | "unknown"}[]
  links: {to: Exclude<ObservedDomain, "dark">; generation: string; state: ObservedChannelState;
    transport: ObservedTransport; oracle: ObservedChannelState; force: ObservedChannelState;
    oracleReady: boolean | null; forceReady: boolean | null}[]
}

/** peerId назначает authenticated transport, а не remote report. null обозначает безымянную локальную incarnation. */
export interface ObservedPeer {
  peerId: string | null
  source: "local" | "peer"
  status: "fresh" | "unknown" | "expired" | "disconnected"
  receivedAt: number | null
  generation: string | null
  transport: "direct" | "relay" | null
  connectionState: "connecting" | "open" | "disconnected"
  report: DomainTransportReport | null
}
export interface PeerNetworkObservation {
  schema: typeof PEER_OBSERVATION_SCHEMA
  producerId: string
  seq: number
  observedAt: number
  localPeerId: string | null
  peers: ObservedPeer[]
}

export const peerObservationRequest = () => ({schema: PEER_OBSERVATION_SCHEMA, kind: "snapshot-request" as const})
export function isPeerObservationRequest(value: unknown) {
  return record(value) && value.schema === PEER_OBSERVATION_SCHEMA && value.kind === "snapshot-request" && Object.keys(value).length === 2
}
const domainNames = ["dark", "boundary", "matrix", "energy"]
const channelStates = ["connecting", "open", "closed", "unknown"]
const transports = ["direct", "relay", "websocket"]
export function parseDomainTransportReport(value: unknown): DomainTransportReport | null {
  if (!record(value) || !keys(value,["schema","producerId","seq","observedAt","domains","links"]) || value.schema !== DOMAIN_OBSERVATION_SCHEMA ||
      !id(value.producerId) || !count(value.seq) || !count(value.observedAt) || !Array.isArray(value.domains) || value.domains.length > 4 || !Array.isArray(value.links) || value.links.length > 3) return null
  const names = new Set<string>()
  for (const domain of value.domains) {
    if (!record(domain) || !keys(domain,["name","state"]) || !choice(domain.name,domainNames) || names.has(domain.name) || !choice(domain.state,["starting","running","closed","unknown"])) return null
    names.add(domain.name)
  }
  const destinations = new Set<string>()
  for (const link of value.links) {
    if (!record(link) || !keys(link,["to","generation","state","transport","oracle","force","oracleReady","forceReady"]) ||
      !choice(link.to,["boundary","matrix","energy"]) || destinations.has(link.to) || !names.has("dark") || !names.has(link.to) ||
      !id(link.generation) || !choice(link.state,channelStates) || !choice(link.transport,transports) || !choice(link.oracle,channelStates) || !choice(link.force,channelStates) ||
      !(link.oracleReady === null || typeof link.oracleReady === "boolean") || !(link.forceReady === null || typeof link.forceReady === "boolean")) return null
    destinations.add(link.to)
  }
  return structuredClone(value) as unknown as DomainTransportReport
}
export function parsePeerNetworkObservation(value: unknown): PeerNetworkObservation | null {
  if (!record(value) || !keys(value,["schema","producerId","seq","observedAt","localPeerId","peers"]) || value.schema !== PEER_OBSERVATION_SCHEMA ||
      !id(value.producerId) || !count(value.seq) || !count(value.observedAt) || !(value.localPeerId === null || id(value.localPeerId)) ||
      !Array.isArray(value.peers) || value.peers.length > 33) return null
  const ids = new Set<unknown>()
  let local = 0
  for (const peer of value.peers) {
    if (!record(peer) || !keys(peer,["peerId","source","status","receivedAt","generation","transport","connectionState","report"]) ||
      !(peer.peerId === null || id(peer.peerId)) || ids.has(peer.peerId) || !choice(peer.source,["local","peer"]) ||
      !choice(peer.status,["fresh","unknown","expired","disconnected"]) || !(peer.receivedAt === null || count(peer.receivedAt)) ||
      !(peer.generation === null || id(peer.generation)) || !(peer.transport === null || choice(peer.transport,["direct","relay"])) ||
      !choice(peer.connectionState,["connecting","open","disconnected"]) || !(peer.report === null || parseDomainTransportReport(peer.report))) return null
    if (peer.source === "local") {local++; if (peer.peerId !== value.localPeerId) return null}
    else if (peer.peerId === null || peer.peerId === value.localPeerId) return null
    if (peer.status === "fresh" && (peer.report === null || peer.receivedAt === null || peer.connectionState !== "open") ||
        peer.status !== "fresh" && peer.report !== null || peer.connectionState === "disconnected" && peer.report !== null ||
        peer.status === "disconnected" && peer.connectionState !== "disconnected") return null
    ids.add(peer.peerId)
  }
  if (local !== 1) return null
  return structuredClone(value) as unknown as PeerNetworkObservation
}
export function id(value: unknown): value is string {return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)}
function count(value: unknown): value is number {return typeof value === "number" && Number.isSafeInteger(value) && value >= 0}
function choice(value: unknown, choices: readonly string[]): value is string {return typeof value === "string" && choices.includes(value)}
function record(value: unknown): value is Record<string, unknown> {return !!value && typeof value === "object" && !Array.isArray(value)}
function keys(value: Record<string,unknown>, expected: readonly string[]) {return Object.keys(value).length === expected.length && expected.every(key=>Object.hasOwn(value,key))}
