import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync} from "node:fs"
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
import {BOUNDARY_INITIAL_STATE_METHOD, BOUNDARY_INITIAL_PROJECTION_METHOD} from "shared/protocol/boundary/initial"
import {DARK_FORCE_HISTORY_READ_METHOD, META_OBSERVATION_CONTRACT_VERSION} from "shared/protocol/metafor/observation"

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
  test("re-drains async work launched after quiescence and every chained applied delivery", async () => {
    const peer = new Peer()
    const control = new DarkCheckpointControl(join(root(), "chain.json"), {cutId: "chain", sequence: 0}, peer as never, headless)
    const firstQuiescence = Promise.withResolvers<void>()
    const enteredTask = Promise.withResolvers<void>()
    const finishTask = Promise.withResolvers<void>()
    let active = false
    let rounds = 0
    peer.call = async (_target, method, params) => {
      if (method === FORCE_CHECKPOINT_WAIT_APPLIED_METHOD) {
        active = (params as CheckpointDeliveryReceipt).acceptanceSequence < 4
        return structuredClone(params)
      }
      if (method === FORCE_CHECKPOINT_QUIESCE_METHOD) {
        expect(control.barrier.phase).toBe("open")
        if (_target !== "energy") return {ok: true, outgoingOrdinal: 0}
        rounds++
        if (rounds === 1) firstQuiescence.resolve()
        if (active) {
          if (rounds === 2) {enteredTask.resolve(); await finishTask.promise}
          active = false
          const receipts = control.recordAccepted(control.barrier.frontier().acceptanceSequence + 1, ["energy"])
          await control.waitApplied(receipts)
        }
        return {ok: true, outgoingOrdinal: 0}
      }
      throw new Error(`Unexpected method: ${method}`)
    }
    const receipts = control.recordAccepted(1, ["energy"])
    let completed = false
    const held = control.holdUnderClosedAdmission().then(frontier => {completed = true; return frontier})
    await firstQuiescence.promise
    await control.waitApplied(receipts)
    await enteredTask.promise
    expect(completed).toBeFalse()
    finishTask.resolve()
    expect(await held).toMatchObject({phase: "held", acceptanceSequence: 4, domains: expect.arrayContaining([{domain: "energy", sentOrdinal: 4, appliedOrdinal: 4, appliedAcceptanceSequence: 4}])})
    expect(rounds).toBe(5)
    expect(() => control.recordAccepted(5, ["energy"])).toThrow("held")
    control.releaseAdmissionHold()
  })

  test("cancellation and failed quiescence leave no held frontier and permit a later read", async () => {
    const peer = new Peer()
    const original = peer.call.bind(peer)
    const control = new DarkCheckpointControl(join(root(), "cancel.json"), {cutId: "cancel", sequence: 0}, peer as never, headless)
    await control.waitApplied(control.recordAccepted(1, ["energy"]))
    const pending = Promise.withResolvers<void>()
    peer.call = async () => {await pending.promise; return {ok: true}}
    const cancellation = new AbortController()
    const held = control.holdUnderClosedAdmission(cancellation.signal)
    cancellation.abort(new Error("Owner cancelled causal read"))
    await expect(held).rejects.toThrow("Owner cancelled")
    expect(control.barrier.phase).toBe("open")
    pending.resolve()
    peer.call = async () => {throw new Error("Energy unavailable")}
    await expect(control.holdUnderClosedAdmission()).rejects.toThrow("Energy unavailable")
    expect(control.barrier.phase).toBe("open")
    peer.call = original
    await expect(control.holdUnderClosedAdmission()).resolves.toMatchObject({phase: "held", acceptanceSequence: 1})
    control.releaseAdmissionHold()
  })

  test("headless checkpoint quiesces exactly its participants and refuses incompatible persisted receipts", async () => {
    const filename = join(root(), "control", "state.json")
    const domains = ["dark", "boundary", "matrix", "energy"] as const
    const targets: string[] = []
    const peer = new Peer()
    const original = peer.call.bind(peer)
    peer.call = async (target, method, params) => {targets.push(target); return original(target, method, params)}
    const control = new DarkCheckpointControl(filename, {cutId: "headless", sequence: 0}, peer as never, domains)
    const receipts = control.recordAccepted(1, ["boundary"])
    await control.prepare(receipts)
    await control.waitApplied(receipts)
    await control.holdUnderClosedAdmission()
    expect(targets).not.toContain("bulk")
    expect(control.state().barrier.domains.map(entry => entry.domain)).toEqual([...domains])
    expect(() => control.recordAccepted(2, ["bulk"])).toThrow()
    expect(() => new DarkCheckpointControl(filename, {cutId: "headless", sequence: 1}, new Peer() as never)).toThrow("persisted")

    const legacy = join(root(), "legacy.json")
    const old = new DarkCheckpointControl(legacy, {cutId: "legacy", sequence: 0}, new Peer() as never)
    old.recordAccepted(1, ["bulk"])
    expect(() => new DarkCheckpointControl(legacy, {cutId: "legacy", sequence: 1}, new Peer() as never, domains)).toThrow("persisted")
    expect(old.pendingDeliveries()).toHaveLength(1)
  })

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

const emptyInitial = () => ({version: 3, atoms: [], declarations: [], pendingProcessExecutions: [], reactionRelations: [], unfinishedReactionExecutions: []})
class EmptyPeer extends Peer {
  readonly calls: {target: string, method: string}[] = []
  initial: unknown = emptyInitial()
  projection: unknown = {version: 1, entries: []}
  history: unknown = {contractVersion: META_OBSERVATION_CONTRACT_VERSION, resolution: "exact",
    frontier: {cutId: "cut-empty", throughSequence: 0, retroactiveComplete: false}, range: null, entries: []}
  beforeOwnerRead?: () => void
  override async call(target: string, method: string, params: unknown): Promise<unknown> {
    this.calls.push({target, method})
    if (method === BOUNDARY_INITIAL_STATE_METHOD) {
      this.beforeOwnerRead?.()
      return structuredClone(this.initial)
    }
    if (method === BOUNDARY_INITIAL_PROJECTION_METHOD) return structuredClone(this.projection)
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return structuredClone(this.history)
    return await super.call(target, method, params)
  }
}

const headless = ["dark", "boundary", "matrix", "energy"] as const
const emptyControl = (peer: EmptyPeer, filename = join(root(), "control.json")) =>
  new DarkCheckpointControl(filename, {cutId: "cut-empty", sequence: 0}, peer as never, headless)

describe("owner-verified empty checkpoint baseline", () => {
  test("cancels a pending empty-owner read without holding or inventing acceptance", async () => {
    const peer = new EmptyPeer()
    const original = peer.call.bind(peer)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    peer.call = async (target, method, params) => {
      if (method === BOUNDARY_INITIAL_STATE_METHOD) {entered.resolve(); await release.promise}
      return original(target, method, params)
    }
    const control = emptyControl(peer)
    const before = control.state()
    const cancellation = new AbortController()
    const held = control.holdUnderClosedAdmission(cancellation.signal)
    await entered.promise
    cancellation.abort(new Error("Owner read cancelled"))
    await expect(held).rejects.toThrow("Owner read cancelled")
    expect(control.barrier.phase).toBe("open")
    expect(control.state()).toEqual(before)
    release.resolve()
    peer.call = original
    await expect(control.holdUnderClosedAdmission()).resolves.toMatchObject({phase: "held", acceptanceSequence: 0})
    control.releaseAdmissionHold()
  })

  test("reads both Boundary owners after all quiescence, holds zero and persists no proof or receipt", async () => {
    const peer = new EmptyPeer()
    const original = peer.call.bind(peer)
    const energy = Promise.withResolvers<void>()
    peer.call = async (target, method, params) => {
      if (target === "energy" && method === FORCE_CHECKPOINT_QUIESCE_METHOD) await energy.promise
      return await original(target, method, params)
    }
    const control = emptyControl(peer)
    const before = readFileSync(control.filename, "utf8")
    const held = control.holdUnderClosedAdmission()
    await Promise.resolve()
    expect(peer.calls.some(call => call.method === BOUNDARY_INITIAL_STATE_METHOD)).toBeFalse()
    energy.resolve()
    await expect(held).resolves.toMatchObject({phase: "held", acceptanceSequence: 0})
    expect(peer.calls).toEqual([
      ...headless.map(target => ({target, method: FORCE_CHECKPOINT_QUIESCE_METHOD})),
      {target: "boundary", method: BOUNDARY_INITIAL_STATE_METHOD},
      {target: "boundary", method: BOUNDARY_INITIAL_PROJECTION_METHOD},
      {target: "dark", method: DARK_FORCE_HISTORY_READ_METHOD},
    ])
    expect(control.pendingDeliveries()).toEqual([])
    expect(readFileSync(control.filename, "utf8")).toBe(before)
  })

  test.each(["atoms", "declarations", "pendingProcessExecutions", "reactionRelations", "unfinishedReactionExecutions"])("nonempty Boundary %s cannot become a zero baseline", async key => {
    const peer = new EmptyPeer()
    peer.initial = {...emptyInitial(), [key]: [{}]}
    const control = emptyControl(peer)
    await expect(control.holdUnderClosedAdmission()).rejects.toMatchObject({code: "sequence_zero_baseline_unresolved"})
    expect(control.barrier.phase).toBe("open")
  })

  test("unknown/missing initial state, projection or history contracts remain unresolved", async () => {
    for (const change of [
      {initial: {...emptyInitial(), version: 2}},
      {initial: {version: 3, atoms: []}},
      {projection: {version: 1, entries: [{}]}},
      {projection: {version: 2, entries: []}},
      {projection: {version: 1, entries: null}},
      {history: {contractVersion: 2, resolution: "exact", frontier: {cutId: "cut-empty", throughSequence: 0, retroactiveComplete: false}, range: null, entries: []}},
      {history: {contractVersion: 1, resolution: "exact", frontier: {cutId: "other-cut", throughSequence: 0, retroactiveComplete: false}, range: null, entries: []}},
      {history: {contractVersion: 1, resolution: "exact", frontier: {cutId: "cut-empty", throughSequence: 1, retroactiveComplete: false}, range: null, entries: []}},
    ]) {
      const peer = Object.assign(new EmptyPeer(), change)
      const control = emptyControl(peer)
      await expect(control.holdUnderClosedAdmission()).rejects.toMatchObject({code: "sequence_zero_baseline_unresolved"})
      expect(control.barrier.phase).toBe("open")
    }
  })

  test("unavailable owner RPC never permits empty hold", async () => {
    const peer = new EmptyPeer()
    const original = peer.call.bind(peer)
    peer.call = async (target, method, params) => {
      if (method === BOUNDARY_INITIAL_STATE_METHOD) throw new Error("Owner unavailable")
      return original(target, method, params)
    }
    await expect(emptyControl(peer).holdUnderClosedAdmission()).rejects.toMatchObject({code: "sequence_zero_baseline_unresolved"})
  })

  test("causal progress or outgoing acceptance during owner reads invalidates the zero proof", async () => {
    for (const progress of ["receipt", "outgoing"] as const) {
      const peer = new EmptyPeer()
      const control = emptyControl(peer)
      peer.beforeOwnerRead = () => {
        if (progress === "receipt") control.recordAccepted(1, ["boundary"])
        else control.acceptedFrom("energy")
      }
      await expect(control.holdUnderClosedAdmission()).rejects.toMatchObject({code: "sequence_zero_baseline_unresolved"})
      expect(control.barrier.phase).toBe("open")
      if (progress === "receipt") expect(control.pendingDeliveries()).toHaveLength(1)
    }
  })

  test("release and new incarnation both reprove zero instead of trusting persisted empty state", async () => {
    const peer = new EmptyPeer()
    const control = emptyControl(peer)
    await control.holdUnderClosedAdmission()
    control.releaseAdmissionHold()
    peer.projection = {version: 1, entries: [{}]}
    await expect(control.holdUnderClosedAdmission()).rejects.toMatchObject({code: "sequence_zero_baseline_unresolved"})
    const restored = emptyControl(peer, control.filename)
    await expect(restored.holdUnderClosedAdmission()).rejects.toMatchObject({code: "sequence_zero_baseline_unresolved"})
    expect(peer.calls.filter(call => call.method === BOUNDARY_INITIAL_STATE_METHOD)).toHaveLength(3)
  })
})
