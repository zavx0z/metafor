import {BaseMonadRpcClient} from "./base.ts"

export {
  MonadRpcRemoteError,
  createHttpMonadChannel,
  normalizeMonadIdentity,
  readHttpProviderRegistration,
} from "./base.ts"
export type {
  HttpMonadRpcProviderRegistration,
  MonadChannel,
  MonadRpcWaitOptions,
} from "./base.ts"

const forceRpcAddress = (): URL => new URL("/", globalThis.location.href)

/** Web REST adapter; the hosting server owns the same-origin Force RPC proxy. */
export class MonadRpcClient extends BaseMonadRpcClient {
  constructor(identity: string, address: string | URL = forceRpcAddress()) {
    super(identity, address)
  }
}
