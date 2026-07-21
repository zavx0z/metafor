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

const forceRpcAddress = (): URL => new URL("/", globalThis.location.href)

/** Current browser REST adapter; a future DataChannel keeps the same channel API. */
export class MonadTransport extends BaseMonadTransport {
  constructor(identity: string, address: string | URL = forceRpcAddress()) {
    super(identity, address)
  }
}
