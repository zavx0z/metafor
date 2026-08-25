import {describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {
  META_CAPABILITIES_READ_METHOD,
  META_CREATE_METHOD,
  META_DECLARATION_APPLY_METHOD,
  META_MATTER_APPLY_METHOD,
  META_SOURCE_REVISION_READ_METHOD,
} from "shared/protocol/metafor/authoring"
import {
  OracleRpcPeer,
  type OracleChannel,
  type OracleChannelListener,
} from "shared/transport/oracle"
import {
  ORACLE_RPC_VERSION,
  type OracleRpcMessage,
} from "shared/protocol/oracle/rpc"
import {DARK_DECLARATION_PROJECTION_METHOD} from "./graph/declaration.ts"
import {DARK_FORCE_HISTORY_READ_METHOD} from "shared/protocol/metafor/observation"
import {
  META_FIELD_VALUE_APPLY_METHOD,
  META_PROCESS_EXECUTION_READ_METHOD,
} from "shared/protocol/metafor/observation"
import {
  DARK_FORCE_PAUSE_METHOD,
  DARK_FORCE_RESUME_METHOD,
  DARK_FORCE_STACK_METHOD,
  DARK_FORCE_STEP_METHOD,
  DarkOracle,
} from "./oracle.ts"

class TestChannel implements OracleChannel {
  readonly identity = "dark"
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

describe("Dark Oracle", () => {
  test("exposes only active Dark service methods and no legacy history RPC", async () => {
    const root = parseMetaAddress("example/dark-oracle")!
    const oracle = new DarkOracle(async (params) => {
      expect(params).toEqual({root})
      return {
        root,
        template: {
          [root]: {
            name: "Dark Oracle",
            fields: [],
            superposition: [],
            mass: [],
            processes: [],
          },
        },
      }
    })
    oracle.setTimeControl({
      async pauseExternalAdmission() {
        return {
          id: 1,
          frontier: {
            cutId: "cut-oracle",
            phase: "held",
            acceptanceSequence: 4,
            domains: [],
          },
        }
      },
      async stepAgentParticle() {
        throw new Error("not used")
      },
      resumeExternalAdmission() {},
      pauseStack() {
        return []
      },
    })
    oracle.setHistory({
      read() {
        return {
          contractVersion: 1,
          resolution: "exact",
          frontier: {cutId: "cut-oracle", throughSequence: 4, retroactiveComplete: false},
          range: null,
          entries: [],
        }
      },
    })
    const channel = new TestChannel()
    const peer = new OracleRpcPeer(channel)

    oracle.onServerStarted(peer)
    expect(peer.methods()).toEqual([
      DARK_DECLARATION_PROJECTION_METHOD,
      DARK_FORCE_HISTORY_READ_METHOD,
      DARK_FORCE_PAUSE_METHOD,
      DARK_FORCE_RESUME_METHOD,
      DARK_FORCE_STACK_METHOD,
      DARK_FORCE_STEP_METHOD,
      "readGraph",
    ])
    oracle.onChannelOpened()

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "declaration-read",
      source: "force",
      target: "dark",
      method: DARK_DECLARATION_PROJECTION_METHOD,
      params: {root},
    })
    expect(channel.sent[0]).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "declaration-read",
      ok: true,
      result: {
        root,
        template: {
          [root]: {
            name: "Dark Oracle",
            fields: [],
            superposition: [],
            mass: [],
            processes: [],
          },
        },
      },
    })

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "history-frontier",
      source: "agent/local",
      target: "dark",
      method: DARK_FORCE_HISTORY_READ_METHOD,
      params: {contractVersion: 1, query: {kind: "frontier"}},
    })
    expect(channel.sent[1]).toEqual({
      version: ORACLE_RPC_VERSION,
      id: "history-frontier",
      ok: true,
      result: {
        contractVersion: 1,
        resolution: "exact",
        frontier: {cutId: "cut-oracle", throughSequence: 4, retroactiveComplete: false},
        range: null,
        entries: [],
      },
    })
  })

  test("binds all authoring methods to the routed RPC source identity", async () => {
    const oracle = new DarkOracle()
    const calls: Array<{method: string; input: unknown; source: string}> = []
    oracle.setAuthoring({
      registry: {
        readCapabilities(input, source) {
          calls.push({method: META_CAPABILITIES_READ_METHOD, input: structuredClone(input), source})
          return {method: META_CAPABILITIES_READ_METHOD} as never
        },
        async readSourceRevisions(input, source) {
          calls.push({method: META_SOURCE_REVISION_READ_METHOD, input: structuredClone(input), source})
          return {method: META_SOURCE_REVISION_READ_METHOD} as never
        },
      },
      create: {
        async create(input, source) {
          calls.push({method: META_CREATE_METHOD, input: structuredClone(input), source})
          return {method: META_CREATE_METHOD} as never
        },
      },
      matter: {
        async apply(input, source) {
          calls.push({method: META_MATTER_APPLY_METHOD, input: structuredClone(input), source})
          return {method: META_MATTER_APPLY_METHOD} as never
        },
      },
      declaration: {
        async apply(input, source) {
          calls.push({method: META_DECLARATION_APPLY_METHOD, input: structuredClone(input), source})
          return {method: META_DECLARATION_APPLY_METHOD} as never
        },
      },
    })
    const channel = new TestChannel()
    const peer = new OracleRpcPeer(channel)
    oracle.onServerStarted(peer)

    for (const [index, method] of [
      META_CAPABILITIES_READ_METHOD,
      META_SOURCE_REVISION_READ_METHOD,
      META_CREATE_METHOD,
      META_MATTER_APPLY_METHOD,
      META_DECLARATION_APPLY_METHOD,
    ].entries()) {
      await channel.receive({
        version: ORACLE_RPC_VERSION,
        id: `authoring-${index}`,
        source: "authoring/client",
        target: "dark",
        method,
        params: {method},
      })
    }

    expect(peer.methods()).toEqual(expect.arrayContaining([
      META_CAPABILITIES_READ_METHOD,
      META_SOURCE_REVISION_READ_METHOD,
      META_CREATE_METHOD,
      META_MATTER_APPLY_METHOD,
      META_DECLARATION_APPLY_METHOD,
    ]))
    expect(calls).toEqual([
      META_CAPABILITIES_READ_METHOD,
      META_SOURCE_REVISION_READ_METHOD,
      META_CREATE_METHOD,
      META_MATTER_APPLY_METHOD,
      META_DECLARATION_APPLY_METHOD,
    ].map((method) => ({method, input: {method}, source: "authoring/client"})))
    expect(channel.sent.map((message) => "result" in message ? message.result : null)).toEqual([
      {method: META_CAPABILITIES_READ_METHOD},
      {method: META_SOURCE_REVISION_READ_METHOD},
      {method: META_CREATE_METHOD},
      {method: META_MATTER_APPLY_METHOD},
      {method: META_DECLARATION_APPLY_METHOD},
    ])
  })

  test("exposes the subject Field input and Process execution projection", async () => {
    const calls: Array<{method: string; input: unknown}> = []
    const oracle = new DarkOracle()
    oracle.setRuntime({
      async applyFieldValue(input) {
        calls.push({method: META_FIELD_VALUE_APPLY_METHOD, input: structuredClone(input)})
        return {method: META_FIELD_VALUE_APPLY_METHOD} as never
      },
      async readProcessExecution(input) {
        calls.push({method: META_PROCESS_EXECUTION_READ_METHOD, input: structuredClone(input)})
        return {method: META_PROCESS_EXECUTION_READ_METHOD} as never
      },
    })
    const channel = new TestChannel()
    const peer = new OracleRpcPeer(channel)
    oracle.onServerStarted(peer)

    for (const [index, method] of [META_FIELD_VALUE_APPLY_METHOD, META_PROCESS_EXECUTION_READ_METHOD].entries()) {
      await channel.receive({
        version: ORACLE_RPC_VERSION,
        id: `runtime-${index}`,
        source: "agent/local",
        target: "dark",
        method,
        params: {method},
      })
    }

    expect(peer.methods()).toEqual(expect.arrayContaining([
      META_FIELD_VALUE_APPLY_METHOD,
      META_PROCESS_EXECUTION_READ_METHOD,
    ]))
    expect(calls).toEqual([
      {method: META_FIELD_VALUE_APPLY_METHOD, input: {method: META_FIELD_VALUE_APPLY_METHOD}},
      {method: META_PROCESS_EXECUTION_READ_METHOD, input: {method: META_PROCESS_EXECUTION_READ_METHOD}},
    ])
  })
})
