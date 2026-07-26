import type {ServerWebSocket} from "bun"
import type {SourcedForceMessage} from "shared/protocol/force/message"
import {
  remoteForceDomains,
  type ForceChannel,
  type RemoteForceDomain,
} from "./store.ts"

export type ForceSocketData = {
  domain: RemoteForceDomain
  id: string
}

export type ForceSocket = ServerWebSocket<ForceSocketData>

export type ForceWebSocketChannels = {
  channels: Record<RemoteForceDomain, ForceChannel>
  readUpgradeIdentity(request: Request): ForceSocketData | null
  opened(socket: ForceSocket): boolean
  closed(socket: ForceSocket): boolean
  decode(raw: string | Buffer): SourcedForceMessage
  close(): void
}

/**
 * Оборачивает физические WebSocket-соединения в четыре remote channel.
 *
 * Функция обслуживает только transport: identity HTTP Upgrade, набор открытых
 * сокетов и JSON-кодирование одной Particle. Решения о server state, готовности
 * и fail-stop принимает `ForceLifecycle`.
 */
export function createForceWebSocketChannels(): ForceWebSocketChannels {
  const sockets = Object.fromEntries(
    remoteForceDomains.map((domain) => [domain, new Set<ForceSocket>()]),
  ) as Record<RemoteForceDomain, Set<ForceSocket>>
  const channels = Object.create(null) as Record<RemoteForceDomain, ForceChannel>

  for (const domain of remoteForceDomains) {
    channels[domain] = {
      domain,
      send(message) {
        const connected = [...sockets[domain]].filter((socket) => socket.readyState === WebSocket.OPEN)
        if (connected.length === 0) throw new Error(`Force domain channel is not connected: ${domain}`)
        const payload = JSON.stringify(message)
        for (const socket of connected) socket.send(payload)
      },
    }
  }

  return {
    channels,
    readUpgradeIdentity(request) {
      const url = new URL(request.url)
      const domain = url.searchParams.get("domain")
      const id = url.searchParams.get("id")
      if (!domain || !id || !remoteForceDomains.includes(domain as RemoteForceDomain)) return null
      return {domain: domain as RemoteForceDomain, id}
    },
    opened(socket) {
      const domainSockets = sockets[socket.data.domain]
      const wasEmpty = domainSockets.size === 0
      domainSockets.add(socket)
      return wasEmpty
    },
    closed(socket) {
      const domainSockets = sockets[socket.data.domain]
      domainSockets.delete(socket)
      return domainSockets.size === 0
    },
    decode(raw) {
      return JSON.parse(String(raw)) as SourcedForceMessage
    },
    close() {
      for (const domain of remoteForceDomains) {
        for (const socket of sockets[domain]) socket.close()
        sockets[domain].clear()
      }
    },
  }
}
