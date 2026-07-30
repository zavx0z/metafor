import type {MonadRpcMessage} from "shared/protocol/monad/rpc"
import {
  type MonadChannel,
  type MonadChannelListener,
} from "shared/transport/monad"

class LocalMonadChannel implements MonadChannel {
  readonly #listeners = new Set<MonadChannelListener>()
  #peer: LocalMonadChannel | null = null
  #closed = false

  constructor(
    readonly identity: string,
    private readonly readMethods: () => readonly string[],
  ) {}

  get methods(): readonly string[] {
    return this.readMethods()
  }

  pair(peer: LocalMonadChannel): void {
    this.#peer = peer
  }

  async send(message: MonadRpcMessage): Promise<void> {
    if (this.#closed || !this.#peer || this.#peer.#closed) {
      throw new Error(`Local Monad channel is closed: ${this.identity}`)
    }
    await Promise.all([...this.#peer.#listeners].map((listener) => listener(message)))
  }

  subscribe(listener: MonadChannelListener): () => void {
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

/** Two ends of one in-process Dark Monad channel: service peer and router. */
export const createLocalMonadChannelPair = (
  identity: string,
  methods: () => readonly string[],
): {peer: MonadChannel; router: MonadChannel} => {
  const peer = new LocalMonadChannel(identity, methods)
  const router = new LocalMonadChannel(identity, methods)
  peer.pair(router)
  router.pair(peer)
  return {peer, router}
}
