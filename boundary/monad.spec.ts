import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {BOUNDARY_INITIAL_STATE_METHOD} from "@metafor/types/boundary/initial"
import {
  MonadRpcPeer,
  type MonadChannel,
  type MonadChannelListener,
} from "shared/transport/monad"
import {
  MONAD_RPC_VERSION,
  type MonadRpcMessage,
} from "shared/protocol/monad/rpc"
import {BoundaryMonad} from "./monad.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

class TestChannel implements MonadChannel {
  readonly identity = "boundary"
  readonly methods: readonly string[] = []
  readonly sent: MonadRpcMessage[] = []
  readonly #listeners = new Set<MonadChannelListener>()

  async send(message: MonadRpcMessage): Promise<void> {
    this.sent.push(structuredClone(message))
  }

  subscribe(listener: MonadChannelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async close(): Promise<void> {}

  async receive(message: MonadRpcMessage): Promise<void> {
    await Promise.all([...this.#listeners].map((listener) => listener(message)))
  }
}

describe("Boundary Monad", () => {
  let boundary: BoundaryDatabase
  let monad: BoundaryMonad

  beforeEach(async () => {
    boundary = await open(":memory:")
    monad = new BoundaryMonad(boundary)
  })

  afterEach(async () => boundary.close())

  test("exposes canonical initial state without knowing the physical transport", async () => {
    const channel = new TestChannel()
    const peer = new MonadRpcPeer(channel)

    monad.onServerStarted(peer)
    expect(peer.methods()).toEqual([BOUNDARY_INITIAL_STATE_METHOD])
    expect(await monad.onHealthRequested(":memory:").json()).toMatchObject({rpc: "registering"})

    monad.onChannelOpened()
    expect(await monad.onHealthRequested(":memory:").json()).toMatchObject({rpc: "ready"})

    await channel.receive({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth",
      source: "matrix",
      target: "boundary",
      method: BOUNDARY_INITIAL_STATE_METHOD,
      params: {},
    })

    expect(channel.sent).toEqual([{
      version: MONAD_RPC_VERSION,
      id: "matrix-birth",
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    }])
  })
})
