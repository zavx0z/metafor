import {describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {
  META_CAPABILITIES_READ_METHOD,
  META_CREATE_METHOD,
  META_MATTER_APPLY_METHOD,
  META_SOURCE_REVISION_READ_METHOD,
} from "@metafor/types/metafor/authoring"
import {
  MonadRpcPeer,
  type MonadChannel,
  type MonadChannelListener,
} from "shared/transport/monad"
import {
  MONAD_RPC_VERSION,
  type MonadRpcMessage,
} from "shared/protocol/monad/rpc"
import {DARK_DECLARATION_PROJECTION_METHOD} from "./graph.ts"
import {
  DARK_FORCE_PAUSE_METHOD,
  DARK_FORCE_RESUME_METHOD,
  DARK_FORCE_STACK_METHOD,
  DARK_FORCE_STEP_METHOD,
  DarkMonad,
} from "./monad.ts"

class TestChannel implements MonadChannel {
  readonly identity = "dark"
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

describe("Dark Monad", () => {
  test("exposes only active Dark service methods and no legacy history RPC", async () => {
    const root = parseMetaAddress("example/dark-monad")!
    const monad = new DarkMonad(async (params) => {
      expect(params).toEqual({root})
      return {
        root,
        template: {
          [root]: {
            name: "Dark Monad",
            fields: [],
            superposition: [],
            mass: [],
            processes: [],
          },
        },
      }
    })
    monad.setTimeControl({
      async pauseExternalAdmission() {
        return {
          id: 1,
          frontier: {
            cutId: "cut-monad",
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
    const channel = new TestChannel()
    const peer = new MonadRpcPeer(channel)

    monad.onServerStarted(peer)
    expect(peer.methods()).toEqual([
      DARK_DECLARATION_PROJECTION_METHOD,
      DARK_FORCE_PAUSE_METHOD,
      DARK_FORCE_RESUME_METHOD,
      DARK_FORCE_STACK_METHOD,
      DARK_FORCE_STEP_METHOD,
      "readGraph",
    ])
    monad.onChannelOpened()

    await channel.receive({
      version: MONAD_RPC_VERSION,
      id: "declaration-read",
      source: "force",
      target: "dark",
      method: DARK_DECLARATION_PROJECTION_METHOD,
      params: {root},
    })
    expect(channel.sent[0]).toEqual({
      version: MONAD_RPC_VERSION,
      id: "declaration-read",
      ok: true,
      result: {
        root,
        template: {
          [root]: {
            name: "Dark Monad",
            fields: [],
            superposition: [],
            mass: [],
            processes: [],
          },
        },
      },
    })
  })

  test("binds all authoring methods to the routed RPC source identity", async () => {
    const monad = new DarkMonad()
    const calls: Array<{method: string; input: unknown; source: string}> = []
    monad.setAuthoring({
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
    })
    const channel = new TestChannel()
    const peer = new MonadRpcPeer(channel)
    monad.onServerStarted(peer)

    for (const [index, method] of [
      META_CAPABILITIES_READ_METHOD,
      META_SOURCE_REVISION_READ_METHOD,
      META_CREATE_METHOD,
      META_MATTER_APPLY_METHOD,
    ].entries()) {
      await channel.receive({
        version: MONAD_RPC_VERSION,
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
    ]))
    expect(calls).toEqual([
      META_CAPABILITIES_READ_METHOD,
      META_SOURCE_REVISION_READ_METHOD,
      META_CREATE_METHOD,
      META_MATTER_APPLY_METHOD,
    ].map((method) => ({method, input: {method}, source: "authoring/client"})))
    expect(channel.sent.map((message) => "result" in message ? message.result : null)).toEqual([
      {method: META_CAPABILITIES_READ_METHOD},
      {method: META_SOURCE_REVISION_READ_METHOD},
      {method: META_CREATE_METHOD},
      {method: META_MATTER_APPLY_METHOD},
    ])
  })
})
