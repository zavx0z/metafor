import {describe, expect, test} from "bun:test"
import {
  MONAD_RPC_VERSION,
  type MonadRpcMessage,
  type RoutedMonadRpcCall,
} from "../../protocol/monad/rpc.ts"
import type {MonadChannel, MonadChannelListener} from "./channel.ts"
import {MonadRpcPeer} from "./peer.ts"

class TestChannel implements MonadChannel {
  readonly sent: MonadRpcMessage[] = []
  readonly #listeners = new Set<MonadChannelListener>()

  constructor(
    readonly identity: string,
    readonly methods: readonly string[] = [],
  ) {}

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

describe("MonadRpcPeer", () => {
  test("correlates a response delivered through the same MonadChannel", async () => {
    const channel = new TestChannel("matrix")
    const peer = new MonadRpcPeer(channel)

    const pending = peer.call("boundary", "boundary.initialState.read", {})
    await Bun.sleep(0)
    expect(channel.sent).toHaveLength(1)
    const call = channel.sent[0]
    expect(call).toMatchObject({target: "boundary", method: "boundary.initialState.read", params: {}})

    await channel.receive({
      version: MONAD_RPC_VERSION,
      id: call!.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })

    await expect(pending).resolves.toEqual({version: 1, atoms: [], declarations: []})
  })

  test("exposes a Monad method without knowing the physical transport", async () => {
    const channel = new TestChannel("boundary")
    const peer = new MonadRpcPeer(channel)
    peer.expose("boundary.initialState.read", async (_params, context) => ({source: context.source}))

    expect(peer.methods()).toEqual(["boundary.initialState.read"])
    await channel.receive({
      version: MONAD_RPC_VERSION,
      id: "matrix-birth",
      source: "matrix",
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    } satisfies RoutedMonadRpcCall)

    expect(channel.sent).toEqual([{
      version: MONAD_RPC_VERSION,
      id: "matrix-birth",
      ok: true,
      result: {source: "matrix"},
    }])
  })
})
