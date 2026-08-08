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

const darkRpcAddress = (): URL => new URL("/", globalThis.location.href)

/** Current browser REST adapter; a future DataChannel keeps the same channel API. */
export class OracleTransport extends BaseOracleTransport {
  constructor(identity: string, address: string | URL = darkRpcAddress()) {
    super(identity, address)
  }
}

const darkOracleWebSocketAddress = (): URL => {
  const address = new URL("/oracle/ws", globalThis.location.href)
  address.protocol = address.protocol === "https:" ? "wss:" : "ws:"
  return address
}

/** Permanent duplex Oracle WebSocket adapter for browser-compatible builds. */
export class OracleWebSocketTransport extends BaseOracleWebSocketTransport {
  constructor(
    identity: string,
    address: string | URL = darkOracleWebSocketAddress(),
  ) {
    super(identity, address)
  }
}
