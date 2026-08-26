import {describe, expect, test} from "bun:test"
import {
  READ_GRAPH_DELTA_METHOD,
  parseMetaAddress,
} from "@metafor/types/metafor/graph"
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
  DarkOracleMutationGate,
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
      async readAtExactFrontier(reader) {
        return await reader({
          cutId: "cut-oracle",
          phase: "held",
          acceptanceSequence: 4,
          domains: [],
        })
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
      READ_GRAPH_DELTA_METHOD,
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

  test("waits for an admitted authoring projection before holding causal time", async () => {
    const events: string[] = []
    let finishMutation!: () => void
    const mutationDone = new Promise<void>((resolve) => {
      finishMutation = resolve
    })
    let mutationStarted!: () => void
    const started = new Promise<void>((resolve) => {
      mutationStarted = resolve
    })
    const oracle = new DarkOracle()
    oracle.setTimeControl({
      async pauseExternalAdmission() {
        events.push("admission:closed")
        events.push("frontier:held")
        return {
          id: 1,
          frontier: {cutId: "cut-gate", phase: "held", acceptanceSequence: 3, domains: []},
        }
      },
      async stepAgentParticle() {
        throw new Error("not used")
      },
      resumeExternalAdmission() {},
      pauseStack() {
        return []
      },
      async readAtExactFrontier(reader) {
        return await reader({cutId: "cut-gate", phase: "held", acceptanceSequence: 3, domains: []})
      },
    })
    oracle.setAuthoring({
      registry: {
        readCapabilities() {
          throw new Error("not used")
        },
        async readSourceRevisions() {
          throw new Error("not used")
        },
      },
      create: {
        async create() {
          throw new Error("not used")
        },
      },
      matter: {
        async apply() {
          throw new Error("not used")
        },
      },
      declaration: {
        async apply() {
          events.push("mutation:started")
          mutationStarted()
          await mutationDone
          events.push("mutation:finished")
          return {ok: true} as never
        },
      },
    })
    const channel = new TestChannel()
    const peer = new OracleRpcPeer(channel)
    oracle.onServerStarted(peer)

    const mutation = channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "mutation",
      source: "agent/local",
      target: "dark",
      method: META_DECLARATION_APPLY_METHOD,
      params: {},
    })
    await started
    const pause = channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "pause",
      source: "agent/local",
      target: "dark",
      method: DARK_FORCE_PAUSE_METHOD,
      params: {},
    })
    await Bun.sleep(0)
    expect(events).toEqual(["mutation:started"])

    finishMutation()
    await Promise.all([mutation, pause])
    expect(events).toEqual([
      "mutation:started",
      "mutation:finished",
      "admission:closed",
      "frontier:held",
    ])

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "mutation-blocked",
      source: "agent/local",
      target: "dark",
      method: META_DECLARATION_APPLY_METHOD,
      params: {},
    })
    expect(events).toEqual([
      "mutation:started",
      "mutation:finished",
      "admission:closed",
      "frontier:held",
    ])
    expect(channel.sent.find((message) => message.id === "mutation-blocked")).toMatchObject({
      ok: false,
      error: {message: "Dark Oracle mutation admission is held by causal time"},
    })

    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "resume",
      source: "agent/local",
      target: "dark",
      method: DARK_FORCE_RESUME_METHOD,
      params: {},
    })
    await channel.receive({
      version: ORACLE_RPC_VERSION,
      id: "mutation-after-resume",
      source: "agent/local",
      target: "dark",
      method: META_DECLARATION_APPLY_METHOD,
      params: {},
    })
    expect(events.slice(-2)).toEqual(["mutation:started", "mutation:finished"])
  })

  test("keeps a new mutation outside one causal provider read", async () => {
    const gate = new DarkOracleMutationGate()
    const events: string[] = []
    let releaseProvider!: () => void
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve
    })
    let providerStarted!: () => void
    const providerHeld = new Promise<void>((resolve) => {
      providerStarted = resolve
    })

    const causalRead = gate.withClosedAdmission(async () => {
      events.push("provider:started")
      providerStarted()
      await providerReleased
      events.push("provider:finished")
      return "snapshot"
    })
    await providerHeld
    await expect(gate.run(async () => {
      events.push("mutation:side-effect")
      return "mutation"
    })).rejects.toThrow("mutation admission is held")
    expect(events).toEqual(["provider:started"])

    releaseProvider()
    await expect(causalRead).resolves.toBe("snapshot")
    expect(events).toEqual(["provider:started", "provider:finished"])
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
