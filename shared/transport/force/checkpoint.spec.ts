import {describe, expect, test} from "bun:test"
import type {ForceMessage} from "../../protocol/force/message.ts"
import {
  FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD,
  FORCE_CHECKPOINT_PREPARE_METHOD,
  FORCE_CHECKPOINT_SESSION_METHOD,
  FORCE_CHECKPOINT_WAIT_APPLIED_METHOD,
  ForceCheckpointDomainSideband,
} from "./checkpoint.ts"

class Peer {
  readonly handlers = new Map<string, (input: unknown) => unknown | Promise<unknown>>()
  readonly calls: Array<{target: string; method: string; params: unknown}> = []

  expose(method: string, handler: (input: unknown) => unknown | Promise<unknown>): void {
    this.handlers.set(method, handler)
  }

  async call(target: string, method: string, params: unknown): Promise<unknown> {
    this.calls.push({target, method, params: structuredClone(params)})
    if (method === FORCE_CHECKPOINT_SESSION_METHOD) {
      return {
        cutId: "cut-sideband",
        domain: "boundary",
        deliveredOrdinal: 0,
        acceptedOutgoingOrdinal: 0,
      }
    }
    if (method === FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD) return {ok: true}
    throw new Error(`Unexpected call: ${method}`)
  }
}

const message: ForceMessage = {
  parts: [{part: "inflaton", op: "test", path: "example/root", by: "dark", ts: 1}],
}

describe("Force checkpoint domain sideband", () => {
  test("keeps receipt off the Particle wire and resolves only after causal output acceptance", async () => {
    const peer = new Peer()
    const sideband = new ForceCheckpointDomainSideband("boundary", peer as never)
    await sideband.open()
    const receipt = {
      cutId: "cut-sideband",
      domain: "boundary" as const,
      sentOrdinal: 1,
      acceptanceSequence: 9,
    }
    await peer.handlers.get(FORCE_CHECKPOINT_PREPARE_METHOD)!(receipt)

    const processing = sideband.processIncoming(message, async (input) => {
      expect(input).toEqual(message)
      sideband.trackOutgoing()
    })
    const applied = peer.handlers.get(FORCE_CHECKPOINT_WAIT_APPLIED_METHOD)!(receipt)
    expect(await applied).toEqual(receipt)
    await processing

    expect(peer.calls).toContainEqual({
      target: "dark",
      method: FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD,
      params: {cutId: "cut-sideband", domain: "boundary", ordinal: 1},
    })
    expect(message).not.toHaveProperty("receipt")
    expect(message.parts[0]).not.toHaveProperty("sequence")
  })

  test("rejects Force delivery without a prepared sideband receipt", async () => {
    const peer = new Peer()
    const sideband = new ForceCheckpointDomainSideband("boundary", peer as never)
    await sideband.open()

    await expect(sideband.processIncoming(message, () => {})).rejects.toThrow("receipt is missing")
  })

  test("accepts the next prepared receipt while the prior delivery is still applying", async () => {
    const peer = new Peer()
    const sideband = new ForceCheckpointDomainSideband("boundary", peer as never)
    await sideband.open()
    const first = {
      cutId: "cut-sideband",
      domain: "boundary" as const,
      sentOrdinal: 1,
      acceptanceSequence: 9,
    }
    const second = {
      cutId: "cut-sideband",
      domain: "boundary" as const,
      sentOrdinal: 2,
      acceptanceSequence: 10,
    }
    await peer.handlers.get(FORCE_CHECKPOINT_PREPARE_METHOD)!(first)

    let release!: () => void
    const processing = sideband.processIncoming(message, async () => {
      await new Promise<void>((resolve) => { release = resolve })
    })
    await expect(peer.handlers.get(FORCE_CHECKPOINT_PREPARE_METHOD)!(second)).resolves.toEqual({ok: true})
    release()
    await processing
    await expect(peer.handlers.get(FORCE_CHECKPOINT_WAIT_APPLIED_METHOD)!(first)).resolves.toEqual(first)
    await sideband.processIncoming(message, () => {})
    await expect(peer.handlers.get(FORCE_CHECKPOINT_WAIT_APPLIED_METHOD)!(second)).resolves.toEqual(second)
  })
})
