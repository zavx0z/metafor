import type {IceServer} from "@metafor/tech-peer"

/** Operator-local identity/trust; credential и ICE settings не входят в наблюдение сети. */
export interface Configuration {
  id: string
  signalingUrl: string
  /** Runtime uses an absolute path; private file readers resolve relative values against that file's directory. */
  tokenFile: string
  allowedPeers: readonly string[]
  /** Все внешние WS используют localhost HTTP proxy; loopback остаётся прямым. Например http://127.0.0.1:11809. */
  webSocketProxyUrl?: string
  iceServers?: readonly IceServer[]
  rtc?: Readonly<{ipv4?: boolean, ipv6?: boolean}>
}
