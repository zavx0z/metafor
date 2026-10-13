import {describe, expect, test} from "bun:test"
import {
  ORACLE_RPC_VERSION,
  type OracleRpcMessage,
  type RoutedOracleRpcCall,
} from "../../protocol/oracle/rpc.ts"
import type {OracleChannel, OracleChannelListener} from "./channel.ts"
import {OracleRpcAdmissionRefusedError, OracleRpcRemoteError} from "./channel.ts"
import {OracleRpcPeer} from "./peer.ts"

class TestChannel implements OracleChannel {
  readonly sent: OracleRpcMessage[] = []
  readonly #listeners = new Set<OracleChannelListener>()

  constructor(
    readonly identity: string,
    readonly methods: readonly string[] = [],
  ) {}

  async send(message: OracleRpcMessage): Promise<void> {
    this.sent.push(structuredClone(message))
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

describe("OracleRpcPeer", () => {
  test("structured no-admission refusal survives the correlated public RPC while ordinary failures keep their original code", async () => {
    const channel = new TestChannel("dark")
    const peer = new OracleRpcPeer(channel)
    const data = {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"}
    peer.expose("apply", () => {throw new OracleRpcAdmissionRefusedError("Changed frontier", data)})
    peer.expose("broken", () => {throw new Error("Unconfirmed outcome")})
    try {
      await channel.receive({version: 1, id: "refused", source: "energy", target: "dark", method: "apply", params: {}})
      expect(channel.sent.at(-1)).toEqual({version: 1, id: "refused", ok: false, error: {code: "admission_refused", message: "Changed frontier", data}})
      await channel.receive({version: 1, id: "broken", source: "energy", target: "dark", method: "broken", params: {}})
      expect(channel.sent.at(-1)).toEqual({version: 1, id: "broken", ok: false, error: {code: "method_error", message: "Unconfirmed outcome"}})
      const pending = peer.call("energy", "apply", {}).catch(error => error)
      await Bun.sleep(0)
      const id = channel.sent.at(-1)!.id
      await channel.receive({version: 1, id, ok: false, error: {code: "admission_refused", message: "Changed frontier", data}})
      const error = await pending
      expect(error).toBeInstanceOf(OracleRpcRemoteError)
      expect(error).toMatchObject({code: "admission_refused", data})
    } finally {peer.close()}
  })
  test("close during asynchronous send rejects the retained call without an unhandled response rejection", async () => {
    const gate = Promise.withResolvers<void>()
    const channel = new TestChannel("energy")
    channel.send = async message => {channel.sent.push(message); await gate.promise}
    const peer = new OracleRpcPeer(channel)
    const pending = peer.call("dark", "readGraph", {})
    peer.close()
    await Bun.sleep(0)
    gate.resolve()
    await expect(pending).rejects.toThrow("closed")
  })
  test("correlates a response delivered through the same OracleChannel", async () => {
    const channel = new TestChannel("matrix")
    const peer = new OracleRpcPeer(channel)

    const pending = peer.call("boundary", "boundary.initialState.read", {})
    await Bun.sleep(0)
    expect(channel.sent).toHaveLength(1)
    const call = channel.sent[0]
    expect(call).toMatchObject({target: "boundary", method: "boundary.initialState.read", params: {}})

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: call!.id,
      ok: true,
      result: {version: 1, atoms: [], declarations: []},
    })

    await expect(pending).resolves.toEqual({version: 1, atoms: [], declarations: []})
  })

  test("exposes an Oracle method without knowing the physical transport", async () => {
    const channel = new TestChannel("boundary")
    const peer = new OracleRpcPeer(channel)
    peer.expose("boundary.initialState.read", async (_params, context) => ({source: context.source}))

    expect(peer.methods()).toEqual(["boundary.initialState.read"])
    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth",
      source: "matrix",
      target: "boundary",
      method: "boundary.initialState.read",
      params: {},
    } satisfies RoutedOracleRpcCall)

    expect(channel.sent).toEqual([{
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth",
      ok: true,
      result: {source: "matrix"},
    }])
  })
})
