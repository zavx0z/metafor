import {BaseMonadTransport} from "./base.ts"

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
