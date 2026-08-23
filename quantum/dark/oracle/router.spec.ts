import {describe, expect, test} from "bun:test"
import {
  ORACLE_RPC_VERSION,
  type OracleRpcMessage,
  type RoutedOracleRpcCall,
} from "shared/protocol/oracle/rpc"
import type {OracleChannel, OracleChannelListener} from "shared/transport/oracle"
import {OracleRouter} from "./router.ts"

class TestChannel implements OracleChannel {
  readonly sent: OracleRpcMessage[] = []
  readonly #listeners = new Set<OracleChannelListener>()
  respond: ((call: RoutedOracleRpcCall) => OracleRpcMessage | Promise<OracleRpcMessage>) | null = null

  constructor(
    readonly identity: string,
    readonly methods: readonly string[] = [],
  ) {}

  async send(message: OracleRpcMessage): Promise<void> {
    this.sent.push(structuredClone(message))
    if ("source" in message && this.respond) await this.receive(await this.respond(message))
  }

  subscribe(listener: OracleChannelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async close(): Promise<void> {}

  async receive(message: OracleRpcMessage): Promise<void> {
    await Promise.all([...this.#listeners].map((listener) => listener(message)))
  }
}

const call = {
  version: ORACLE_RPC_VERSION,
  id: "matrix-birth-1",
  target: "boundary",
  method: "boundary.initialState.read",
  params: {},
} as const

describe("OracleRouter", () => {
  test("routes calls and responses between two permanent OracleChannels", async () => {
    const matrix = new TestChannel("matrix")
    const boundary = new TestChannel("boundary", [call.method])
    boundary.respond = (request) => ({
      version: ORACLE_RPC_VERSION,
      id: request.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })
    const router = new OracleRouter()
    router.attach(matrix)
    router.attach(boundary)

    await matrix.receive(call)

    expect(boundary.sent).toEqual([{...call, source: "matrix"}])
    expect(matrix.sent).toEqual([{
      version: ORACLE_RPC_VERSION,
      id: call.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    }])
  })

  test("keeps channel and method availability in the service plane", async () => {
    const matrix = new TestChannel("matrix")
    const router = new OracleRouter()
    router.attach(matrix)

    await matrix.receive(call)
    expect(matrix.sent.at(-1)).toMatchObject({ok: false, error: {code: "provider_unavailable"}})

    const boundary = new TestChannel("boundary", ["boundary.health.read"])
    router.attach(boundary)
    await matrix.receive({...call, id: "method-unavailable"})
    expect(matrix.sent.at(-1)).toMatchObject({ok: false, error: {code: "method_unavailable"}})
  })

  test("detaches only the currently attached channel for an identity", async () => {
    const router = new OracleRouter()
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
