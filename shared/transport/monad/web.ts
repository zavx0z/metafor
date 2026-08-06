import {BaseMonadTransport} from "./base.ts"
import {
  MonadWebSocketTransport as BaseMonadWebSocketTransport,
} from "./socket.ts"

export {
  createHttpMonadChannelRegistry,
  isLoopbackAddress,
  normalizeMonadIdentity,
  readBearerToken,
  readHttpMonadChannel,
  readHttpMonadChannelOpening,
} from "./base.ts"
export type {
  HttpMonadChannelOpened,
  HttpMonadChannelOpening,
  HttpMonadChannelRegistry,
  HttpMonadChannelSession,
  MonadTransportOpenOptions,
} from "./base.ts"
export {
  MonadRpcRemoteError,
} from "./channel.ts"
export type {
  MonadChannel,
  MonadChannelListener,
} from "./channel.ts"
export {
  MonadRpcPeer,
} from "./peer.ts"
export type {
  MonadRpcContext,
  MonadRpcHandler,
  MonadRpcWaitOptions,
} from "./peer.ts"
export {
  MONAD_WEBSOCKET_MAX_MESSAGE_BYTES,
  MONAD_WEBSOCKET_PATH,
  createMonadWebSocketChannelRegistry,
  readMonadWebSocketData,
} from "./socket.ts"
export type {
  MonadWebSocketChannelRegistry,
  MonadWebSocketData,
} from "./socket.ts"

const forceRpcAddress = (): URL => new URL("/", globalThis.location.href)

/** Current browser REST adapter; a future DataChannel keeps the same channel API. */
export class MonadTransport extends BaseMonadTransport {
  constructor(identity: string, address: string | URL = forceRpcAddress()) {
    super(identity, address)
  }
}

const forceMonadWebSocketAddress = (): URL => {
  const address = new URL("/monad/ws", globalThis.location.href)
  address.protocol = address.protocol === "https:" ? "wss:" : "ws:"
  return address
}

/** Permanent duplex Monad WebSocket adapter for browser-compatible builds. */
export class MonadWebSocketTransport extends BaseMonadWebSocketTransport {
  constructor(
    identity: string,
    address: string | URL = forceMonadWebSocketAddress(),
  ) {
    super(identity, address)
  }
}
