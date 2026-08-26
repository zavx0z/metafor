import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  BOUNDARY_INITIAL_STATE_METHOD,
} from "shared/protocol/boundary/initial"
import {
  BOUNDARY_FIELD_VALUE_PLAN_METHOD,
  BOUNDARY_GRAPH_PROJECTION_METHOD,
  BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
} from "shared/protocol/boundary/runtime"
import {
  OracleRpcPeer,
  type OracleChannel,
  type OracleChannelListener,
} from "shared/transport/oracle"
import {
  ORACLE_RPC_VERSION,
  type OracleRpcMessage,
} from "shared/protocol/oracle/rpc"
import {BoundaryOracle} from "./oracle.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

class TestChannel implements OracleChannel {
  readonly identity = "boundary"
  readonly methods: readonly string[] = []
  readonly sent: OracleRpcMessage[] = []
  readonly #listeners = new Set<OracleChannelListener>()

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

describe("Boundary Oracle", () => {
  let boundary: BoundaryDatabase
  let oracle: BoundaryOracle

  beforeEach(async () => {
    boundary = await open(":memory:")
    oracle = new BoundaryOracle(boundary)
  })

  afterEach(async () => boundary.close())

  test("exposes canonical initial state without knowing the physical transport", async () => {
    const channel = new TestChannel()
    const peer = new OracleRpcPeer(channel)

    oracle.onServerStarted(peer)
    expect(peer.methods()).toEqual([
      BOUNDARY_GRAPH_PROJECTION_METHOD,
      BOUNDARY_INITIAL_PROJECTION_METHOD,
      BOUNDARY_INITIAL_STATE_METHOD,
      BOUNDARY_FIELD_VALUE_PLAN_METHOD,
      BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
    ])
    expect(await oracle.onHealthRequested(":memory:").json()).toMatchObject({rpc: "registering"})

    oracle.onChannelOpened()
    expect(await oracle.onHealthRequested(":memory:").json()).toMatchObject({rpc: "ready"})

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth",
      source: "matrix",
      target: "boundary",
      method: BOUNDARY_INITIAL_STATE_METHOD,
      params: {},
    })

    expect(channel.sent).toEqual([{
      version: ORACLE_RPC_VERSION,
      id: "matrix-birth",
      ok: true,
      result: {
        version: 3,
        atoms: [],
        declarations: [],
        pendingProcessExecutions: [],
        reactionRelations: [],
        unfinishedReactionExecutions: [],
      },
    }])

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "bulk-birth",
      source: "bulk",
      target: "boundary",
      method: BOUNDARY_INITIAL_PROJECTION_METHOD,
      params: {},
    })

    expect(channel.sent[1]).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "bulk-birth",
      ok: true,
      result: {version: 1, entries: []},
    })

    await boundary.materialize({parts: [{
      part: "inflaton",
      op: "add",
      path: "wimp",
      value: {src: "owner/runtime", name: "Runtime"},
      ts: 1,
    }]})

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "graph-read",
      source: "oracle",
      target: "boundary",
      method: BOUNDARY_GRAPH_PROJECTION_METHOD,
      params: {},
    })

    expect(channel.sent[2]).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "graph-read",
      ok: true,
      result: {
        root: "owner/runtime",
        runtime: {roots: [{
          ref: "atom:1",
          kind: "atom",
          declaration: "#/template/owner~1runtime",
          meta: "owner/runtime",
          state: null,
          values: {},
          mass: [],
        }], reactions: []},
      },
    })
  })
})
