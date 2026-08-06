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

const forceRpcAddress = (): URL => {
  const configured = Bun.env.FORCE_RPC_ADDRESS?.trim()
  if (configured) return new URL(configured.endsWith("/") ? configured : `${configured}/`)
  const transport = new URL(Bun.env.FORCE_ADDRESS?.trim() || "ws://127.0.0.1:4000/ws")
  transport.protocol = transport.protocol === "wss:" ? "https:" : "http:"
  transport.pathname = "/"
  transport.search = ""
  transport.hash = ""
  return transport
}

/** Current server-side physical adapter that produces one logical MonadChannel. */
export class MonadTransport extends BaseMonadTransport {
  constructor(identity: string, address: string | URL = forceRpcAddress()) {
    super(identity, address)
  }
}

const forceMonadWebSocketAddress = (): URL => {
  const address = new URL(Bun.env.FORCE_ADDRESS?.trim() || "ws://127.0.0.1:4000/ws")
  address.protocol = address.protocol === "https:" ? "wss:" : address.protocol === "http:" ? "ws:" : address.protocol
  address.pathname = "/monad/ws"
  address.search = ""
  address.hash = ""
  return address
}

/** Permanent domain-to-Dark Monad channel sharing Dark's only listener. */
export class MonadWebSocketTransport extends BaseMonadWebSocketTransport {
  constructor(
    identity: string,
    address: string | URL = forceMonadWebSocketAddress(),
  ) {
    super(identity, address)
  }
}
