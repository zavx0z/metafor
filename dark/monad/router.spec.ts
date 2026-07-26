import {describe, expect, test} from "bun:test"
import {
  MONAD_RPC_VERSION,
  type MonadRpcMessage,
  type RoutedMonadRpcCall,
} from "shared/protocol/monad/rpc"
import type {MonadChannel, MonadChannelListener} from "shared/transport/monad"
import {MonadRouter} from "./router.ts"

class TestChannel implements MonadChannel {
  readonly sent: MonadRpcMessage[] = []
  readonly #listeners = new Set<MonadChannelListener>()
  respond: ((call: RoutedMonadRpcCall) => MonadRpcMessage | Promise<MonadRpcMessage>) | null = null

  constructor(
    readonly identity: string,
    readonly methods: readonly string[] = [],
  ) {}

  async send(message: MonadRpcMessage): Promise<void> {
    this.sent.push(structuredClone(message))
    if ("source" in message && this.respond) await this.receive(await this.respond(message))
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

const call = {
  version: MONAD_RPC_VERSION,
  id: "matrix-birth-1",
  target: "boundary",
  method: "boundary.initialState.read",
  params: {},
} as const

describe("MonadRouter", () => {
  test("routes calls and responses between two permanent MonadChannels", async () => {
    const matrix = new TestChannel("matrix")
    const boundary = new TestChannel("boundary", [call.method])
    boundary.respond = (request) => ({
      version: MONAD_RPC_VERSION,
      id: request.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
    const router = new MonadRouter()
    router.attach(matrix)
    router.attach(boundary)

    await matrix.receive(call)

    expect(boundary.sent).toEqual([{...call, source: "matrix"}])
    expect(matrix.sent).toEqual([{
      version: MONAD_RPC_VERSION,
      id: call.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    }])
  })

  test("keeps channel and method availability in the service plane", async () => {
    const matrix = new TestChannel("matrix")
    const router = new MonadRouter()
    router.attach(matrix)

    await matrix.receive(call)
    expect(matrix.sent.at(-1)).toMatchObject({ok: false, error: {code: "provider_unavailable"}})

    const boundary = new TestChannel("boundary", ["boundary.health.read"])
    router.attach(boundary)
    await matrix.receive({...call, id: "method-unavailable"})
    expect(matrix.sent.at(-1)).toMatchObject({ok: false, error: {code: "method_unavailable"}})
  })

  test("detaches only the currently attached channel for an identity", async () => {
    const router = new MonadRouter()
    const first = new TestChannel("boundary", [call.method])
    const second = new TestChannel("boundary", [call.method])

    router.attach(first)
    router.attach(second)
    expect(router.detach(first)).toBe(false)
    expect(router.channels()).toEqual([{identity: "boundary", methods: [call.method]}])
    expect(router.detach(second)).toBe(true)
    expect(router.channels()).toEqual([])
  })
})
