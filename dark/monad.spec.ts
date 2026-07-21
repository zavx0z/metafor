import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  DARK_HISTORY_CLEAR_METHOD,
  DARK_HISTORY_READ_METHOD,
} from "@metafor/types/dark/history"
import {
  MonadRpcPeer,
  type MonadChannel,
  type MonadChannelListener,
} from "shared/transport/monad"
import {
  MONAD_RPC_VERSION,
  type MonadRpcMessage,
} from "shared/protocol/monad/rpc"
import {DarkHistory} from "./history.ts"
import {DarkMonad} from "./monad.ts"

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

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

describe("Dark Monad", () => {
  test("exposes time-step history read and guarded clear through transport-neutral RPC", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-dark-monad-"))
    temporaryDirectories.push(directory)
    const history = new DarkHistory(join(directory, "particles.jsonl"))
    history.record("incoming", {
      part: "photon",
      op: "add",
      path: 1,
      by: "matrix",
      ts: 9,
    })
    const monad = new DarkMonad(history)
    const channel = new TestChannel()
    const peer = new MonadRpcPeer(channel)

    monad.onServerStarted(peer)
    expect(peer.methods()).toEqual([DARK_HISTORY_CLEAR_METHOD, DARK_HISTORY_READ_METHOD])
    monad.onChannelOpened()

    await channel.receive({
      version: MONAD_RPC_VERSION,
      id: "history-read",
      source: "agent-tool",
      target: "dark",
      method: DARK_HISTORY_READ_METHOD,
      params: {fromTs: 0},
    })
    expect(channel.sent[0]).toMatchObject({
      id: "history-read",
      ok: true,
      result: {steps: [{ts: 9, patches: [{particle: {by: "matrix", ts: 9}}]}]},
    })

    await channel.receive({
      version: MONAD_RPC_VERSION,
      id: "history-clear",
      source: "agent-tool",
      target: "dark",
      method: DARK_HISTORY_CLEAR_METHOD,
      params: {confirm: "clear-dark-history"},
    })
    expect(channel.sent[1]).toMatchObject({
      id: "history-clear",
      ok: true,
      result: {removed: 1, latestTs: null},
    })
  })
})
