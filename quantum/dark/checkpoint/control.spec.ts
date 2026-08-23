import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD,
  FORCE_CHECKPOINT_PREPARE_METHOD,
  FORCE_CHECKPOINT_QUIESCE_METHOD,
  FORCE_CHECKPOINT_SESSION_METHOD,
  FORCE_CHECKPOINT_WAIT_APPLIED_METHOD,
} from "shared/transport/force/checkpoint"
import {
  DarkCheckpointControl,
  initializeCheckpointControlBaseline,
} from "./control.ts"
import type {CheckpointDeliveryReceipt} from "./barrier.ts"

const directories: string[] = []

const root = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-checkpoint-control-"))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true})
})
class Peer {
  readonly handlers = new Map<string, (input: unknown) => unknown | Promise<unknown>>()

  expose(method: string, handler: (input: unknown) => unknown | Promise<unknown>): void {
    this.handlers.set(method, handler)
  }

  async call(_target: string, method: string, params: unknown): Promise<unknown> {
    if (method === FORCE_CHECKPOINT_PREPARE_METHOD) return {ok: true}
    if (method === FORCE_CHECKPOINT_WAIT_APPLIED_METHOD) return structuredClone(params)
    if (method === FORCE_CHECKPOINT_QUIESCE_METHOD) return {ok: true, outgoingOrdinal: 0}
    throw new Error(`Unexpected method: ${method}`)
  }
}

describe("Dark checkpoint receipt persistence", () => {
  test("persists acceptance before delivery and reconstructs a settled frontier", async () => {
    const filename = join(root(), "control", "state.json")
    const peer = new Peer()
    const control = new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 0},
      peer as never,
    )
    const receipts = control.recordAccepted(1, ["dark", "bulk"])
    await control.prepare(receipts)
    await control.waitApplied(receipts)

    const restored = new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 1},
      new Peer() as never,
    )
    expect(restored.barrier.frontier()).toMatchObject({
      acceptanceSequence: 1,
      domains: expect.arrayContaining([
        expect.objectContaining({domain: "dark", sentOrdinal: 1, appliedOrdinal: 1}),
        expect.objectContaining({domain: "bulk", sentOrdinal: 1, appliedOrdinal: 1}),
      ]),
    })
  })

  test("reconstructs unresolved receipts for exact Force history recovery", () => {
    const filename = join(root(), "control", "state.json")
    const control = new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 0},
      new Peer() as never,
    )
    control.recordAccepted(1, ["boundary", "bulk"])

    const restored = new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 1},
      new Peer() as never,
    )
    expect(restored.pendingDeliveries()).toEqual([
      {cutId: "cut-control", domain: "boundary", sentOrdinal: 1, acceptanceSequence: 1},
      {cutId: "cut-control", domain: "bulk", sentOrdinal: 1, acceptanceSequence: 1},
    ])
  })

  test("prepares each domain's recovered receipts in contiguous ordinal order", async () => {
    const filename = join(root(), "control", "state.json")
    const peer = new Peer()
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const calls: number[] = []
    peer.call = async (_target, method, params) => {
      if (method !== FORCE_CHECKPOINT_PREPARE_METHOD) {
        throw new Error(`Unexpected method: ${method}`)
      }
      const ordinal = (params as {sentOrdinal: number}).sentOrdinal
      calls.push(ordinal)
      if (ordinal === 1) await firstPending
      return {ok: true}
    }
    const control = new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 0},
      peer as never,
    )
    const receipts = [
      ...control.recordAccepted(1, ["dark"]),
      ...control.recordAccepted(2, ["dark"]),
    ]

    const preparation = control.prepare(receipts)
    await Promise.resolve()
    expect(calls).toEqual([1])
    releaseFirst()
    await preparation
    expect(calls).toEqual([1, 2])
  })

  test("keeps a covered recovery acknowledgement idempotent after nested causal progress", async () => {
    const filename = join(root(), "control-covered", "state.json")
    const peer = new Peer()
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    peer.call = async (_target, method, params) => {
      if (method !== FORCE_CHECKPOINT_WAIT_APPLIED_METHOD) {
        throw new Error(`Unexpected method: ${method}`)
      }
      const receipt = structuredClone(params) as CheckpointDeliveryReceipt
      if (receipt.sentOrdinal === 1) await firstPending
      return receipt
    }
    const control = new DarkCheckpointControl(
      filename,
      {cutId: "cut-covered", sequence: 0},
      peer as never,
    )
    const [first] = control.recordAccepted(1, ["dark"])
    const [second] = control.recordAccepted(2, ["dark"])

    const waitingFirst = control.waitApplied([first!])
    await control.waitApplied([second!])
    releaseFirst()
    await waitingFirst

    expect(control.barrier.frontier().domains.find(({domain}) => domain === "dark")).toMatchObject({
      appliedOrdinal: 2,
      appliedAcceptanceSequence: 2,
    })
  })

  test("refuses a missing baseline for non-empty Particle history", () => {
    const filename = join(root(), "control", "state.json")
    expect(() => new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 1},
      new Peer() as never,
    )).toThrow("baseline is missing")
  })

  test("reconstructs an explicit non-zero capture baseline and sideband session", async () => {
    const filename = join(root(), "control", "state.json")
    initializeCheckpointControlBaseline(filename, "cut-control", 7)
    const peer = new Peer()
    new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 7},
      peer as never,
    )

    expect(await peer.handlers.get(FORCE_CHECKPOINT_SESSION_METHOD)!({domain: "energy"})).toEqual({
      cutId: "cut-control",
      domain: "energy",
      deliveredOrdinal: 0,
      acceptedOutgoingOrdinal: 0,
    })
    const waiting = peer.handlers.get(FORCE_CHECKPOINT_OUTGOING_THROUGH_METHOD)!({
      cutId: "cut-control",
      domain: "energy",
      ordinal: 0,
    })
    expect(await waiting).toEqual({ok: true, ordinal: 0})
  })

  test("quiesces all domains, holds the exact baseline and releases explicitly", async () => {
    const filename = join(root(), "control", "state.json")
    initializeCheckpointControlBaseline(filename, "cut-control", 7)
    const peer = new Peer()
    const calls: string[] = []
    const original = peer.call.bind(peer)
    peer.call = async (target, method, params) => {
      if (method === FORCE_CHECKPOINT_QUIESCE_METHOD) calls.push(target)
      return await original(target, method, params)
    }
    const control = new DarkCheckpointControl(
      filename,
      {cutId: "cut-control", sequence: 7},
      peer as never,
    )

    await expect(control.holdUnderClosedAdmission()).resolves.toMatchObject({
      cutId: "cut-control",
      acceptanceSequence: 7,
      phase: "held",
    })
    expect(calls).toEqual(["dark", "boundary", "matrix", "energy", "bulk"])
    expect(control.releaseAdmissionHold()).toMatchObject({phase: "open"})
  })
})
