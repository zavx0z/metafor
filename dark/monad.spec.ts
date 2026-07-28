import {describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/meta-json"
import {
  MonadRpcPeer,
  type MonadChannel,
  type MonadChannelListener,
} from "shared/transport/monad"
import {
  MONAD_RPC_VERSION,
  type MonadRpcMessage,
} from "shared/protocol/monad/rpc"
import {DARK_DECLARATION_PROJECTION_METHOD} from "./meta-json.ts"
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
      "readMetaJSON",
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
})
