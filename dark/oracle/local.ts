import type {OracleRpcMessage} from "shared/protocol/oracle/rpc"
import {
  type OracleChannel,
  type OracleChannelListener,
} from "shared/transport/oracle"

class LocalOracleChannel implements OracleChannel {
  readonly #listeners = new Set<OracleChannelListener>()
  #peer: LocalOracleChannel | null = null
  #closed = false

  constructor(
    readonly identity: string,
    private readonly readMethods: () => readonly string[],
  ) {}

  get methods(): readonly string[] {
    return this.readMethods()
  }

  pair(peer: LocalOracleChannel): void {
    this.#peer = peer
  }

  async send(message: OracleRpcMessage): Promise<void> {
    if (this.#closed || !this.#peer || this.#peer.#closed) {
      throw new Error(`Local Oracle channel is closed: ${this.identity}`)
    }
    await Promise.all([...this.#peer.#listeners].map((listener) => listener(message)))
  }

  subscribe(listener: OracleChannelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#listeners.clear()
    const peer = this.#peer
    if (peer && !peer.#closed) {
      peer.#closed = true
      peer.#listeners.clear()
    }
  }
}

/** Two ends of one in-process Dark Oracle channel: service peer and router. */
export const createLocalOracleChannelPair = (
  identity: string,
  methods: () => readonly string[],
): {peer: OracleChannel; router: OracleChannel} => {
  const peer = new LocalOracleChannel(identity, methods)
  const router = new LocalOracleChannel(identity, methods)
  peer.pair(router)
  router.pair(peer)
  return {peer, router}
}
