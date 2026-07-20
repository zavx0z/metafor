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

/** Server REST adapter for a Monad channel to Force RPC. */
export class MonadRpcClient extends BaseMonadRpcClient {
  constructor(identity: string, address: string | URL = forceRpcAddress()) {
    super(identity, address)
  }
}
