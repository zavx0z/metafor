import {BaseOracleTransport} from "./base.ts"
import {
  OracleWebSocketTransport as BaseOracleWebSocketTransport,
} from "./socket.ts"

export {
  createHttpOracleChannelRegistry,
  isLoopbackAddress,
  normalizeOracleIdentity,
  readBearerToken,
  readHttpOracleChannel,
  readHttpOracleChannelOpening,
} from "./base.ts"
export type {
  HttpOracleChannelOpened,
  HttpOracleChannelOpening,
  HttpOracleChannelRegistry,
  HttpOracleChannelSession,
  OracleTransportOpenOptions,
} from "./base.ts"
export {
  OracleRpcRemoteError,
} from "./channel.ts"
export type {
  OracleChannel,
  OracleChannelListener,
} from "./channel.ts"
export {
  OracleRpcPeer,
} from "./peer.ts"
export type {
  OracleRpcContext,
  OracleRpcHandler,
  OracleRpcWaitOptions,
} from "./peer.ts"
export {
  ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES,
  ORACLE_WEBSOCKET_PATH,
  createOracleWebSocketChannelRegistry,
  readOracleWebSocketData,
} from "./socket.ts"
export type {
  OracleWebSocketChannelRegistry,
  OracleWebSocketData,
} from "./socket.ts"

const darkRpcAddress = (): URL => {
  const configured = Bun.env.FORCE_RPC_ADDRESS?.trim()
  if (configured) return new URL(configured.endsWith("/") ? configured : `${configured}/`)
  const transport = new URL(Bun.env.FORCE_ADDRESS?.trim() || "ws://127.0.0.1:4000/ws")
  transport.protocol = transport.protocol === "wss:" ? "https:" : "http:"
  transport.pathname = "/"
  transport.search = ""
  transport.hash = ""
  return transport
}

/** Current server-side physical adapter that produces one logical OracleChannel. */
export class OracleTransport extends BaseOracleTransport {
  constructor(identity: string, address: string | URL = darkRpcAddress()) {
    super(identity, address)
  }
}

const darkOracleWebSocketAddress = (): URL => {
  const address = new URL(Bun.env.FORCE_ADDRESS?.trim() || "ws://127.0.0.1:4000/ws")
  address.protocol = address.protocol === "https:" ? "wss:" : address.protocol === "http:" ? "ws:" : address.protocol
  address.pathname = "/oracle/ws"
  address.search = ""
  address.hash = ""
  return address
}

/** Permanent domain-to-Dark Oracle channel sharing Dark's only listener. */
export class OracleWebSocketTransport extends BaseOracleWebSocketTransport {
  constructor(
    identity: string,
    address: string | URL = darkOracleWebSocketAddress(),
  ) {
    super(identity, address)
  }
}
