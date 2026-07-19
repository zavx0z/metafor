import type {ServerWebSocket} from "bun"
import type {SourcedForceMessage} from "@metafor/types/force/message"
import {forceDomains, type ForceDomain, type ForceStore} from "../store.ts"

export type ForceSocketData = {
  domain: ForceDomain
  id: string
}

export type ForceSocket = ServerWebSocket<ForceSocketData>

export type ForceWebSocketChannels = {
  channels: ForceStore
  readUpgradeIdentity(request: Request): ForceSocketData | null
  opened(socket: ForceSocket): boolean
  closed(socket: ForceSocket): boolean
  decode(raw: string | Buffer): SourcedForceMessage
  close(): void
}

/**
 * Оборачивает физические WebSocket-соединения в пять каналов Store.
 *
 * Функция обслуживает только transport: identity HTTP Upgrade, набор открытых
 * сокетов и JSON-кодирование одной Particle. Решения о server state, готовности
 * и fail-stop принимает Монада.
 */
export function createForceWebSocketChannels(): ForceWebSocketChannels {
  const sockets = Object.fromEntries(
    forceDomains.map((domain) => [domain, new Set<ForceSocket>()]),
  ) as Record<ForceDomain, Set<ForceSocket>>
  const channels = Object.create(null) as ForceStore

  for (const domain of forceDomains) {
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
      if (!domain || !id || !forceDomains.includes(domain as ForceDomain)) return null
      return {domain: domain as ForceDomain, id}
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
      for (const domain of forceDomains) {
        for (const socket of sockets[domain]) socket.close()
        sockets[domain].clear()
      }
    },
  }
}
