import {describe, expect, test} from "bun:test"
import {
  CheckpointAppliedThroughBarrier,
  CheckpointBarrierError,
  type CheckpointDeliveryReceipt,
} from "./barrier.ts"

const errorCode = (operation: () => unknown): string | undefined => {
  try {
    operation()
  } catch (error) {
    return error instanceof CheckpointBarrierError ? error.code : undefined
  }
  return undefined
}

const rejectionCode = async (operation: Promise<unknown>): Promise<string | undefined> => {
  try {
    await operation
  } catch (error) {
    return error instanceof CheckpointBarrierError ? error.code : undefined
  }
  return undefined
}

const nextTurn = async (): Promise<void> => {
  await Promise.resolve()
}

describe("isolated checkpoint applied-through barrier", () => {
  test("maps accepted sequences to per-domain sent ordinals and holds the exact frontier", async () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-a")
    const [boundary] = barrier.recordAccepted(1, ["boundary"])
    const [matrix, energy] = barrier.recordAccepted(2, ["matrix", "energy"])
    const [boundaryAgain] = barrier.recordAccepted(3, ["boundary"])

    expect(boundary).toEqual({
      cutId: "cut-a",
      domain: "boundary",
      sentOrdinal: 1,
      acceptanceSequence: 1,
    })
    expect(boundaryAgain).toMatchObject({sentOrdinal: 2, acceptanceSequence: 3})

    let resolved = false
    const held = barrier.holdUnderClosedAdmission().then((frontier) => {
      resolved = true
      return frontier
    })
    await nextTurn()
    expect(resolved).toBe(false)

    expect(barrier.acknowledgeApplied(boundaryAgain)).toBe(true)
    expect(barrier.acknowledgeApplied(matrix)).toBe(true)
    expect(barrier.acknowledgeApplied(energy)).toBe(true)

    await expect(held).resolves.toEqual({
      cutId: "cut-a",
      phase: "held",
      acceptanceSequence: 3,
      domains: [
        {domain: "dark", sentOrdinal: 0, appliedOrdinal: 0, appliedAcceptanceSequence: 0},
        {domain: "boundary", sentOrdinal: 2, appliedOrdinal: 2, appliedAcceptanceSequence: 3},
        {domain: "matrix", sentOrdinal: 1, appliedOrdinal: 1, appliedAcceptanceSequence: 2},
        {domain: "energy", sentOrdinal: 1, appliedOrdinal: 1, appliedAcceptanceSequence: 2},
        {domain: "bulk", sentOrdinal: 0, appliedOrdinal: 0, appliedAcceptanceSequence: 0},
      ],
    })
  })

  test("extends a settling frontier with causally emitted accepted Particles", async () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-fixed-point")
    const [boundary] = barrier.recordAccepted(1, ["boundary"])
    let held = false
    const fixedPoint = barrier.holdUnderClosedAdmission().then((frontier) => {
      held = true
      return frontier
    })

    const [dark, matrix, bulk] = barrier.recordAccepted(2, ["dark", "matrix", "bulk"])
    barrier.acknowledgeApplied(boundary)
    barrier.acknowledgeApplied(dark)
    barrier.acknowledgeApplied(matrix)
    await nextTurn()
    expect(held).toBe(false)

    barrier.acknowledgeApplied(bulk)
    const frontier = await fixedPoint
    expect(frontier.acceptanceSequence).toBe(2)
    expect(frontier.domains.find(({domain}) => domain === "bulk")).toEqual({
      domain: "bulk",
      sentOrdinal: 1,
      appliedOrdinal: 1,
      appliedAcceptanceSequence: 2,
    })
  })

  test("freezes acceptance and acknowledgement while held, then reopens explicitly", async () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-hold")
    const [receipt] = barrier.recordAccepted(1, ["dark"])
    barrier.acknowledgeApplied(receipt)
    await barrier.holdUnderClosedAdmission()

    expect(errorCode(() => barrier.recordAccepted(2, ["boundary"]))).toBe("barrier_held")
    expect(errorCode(() => barrier.acknowledgeApplied(receipt))).toBe("barrier_held")

    barrier.release()
    expect(barrier.recordAccepted(2, [])).toEqual([])
    await expect(barrier.holdUnderClosedAdmission()).resolves.toMatchObject({
      phase: "held",
      acceptanceSequence: 2,
    })
  })

  test("accepts an exact duplicate acknowledgement but rejects ahead, mismatch and regression", () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-ack")
    const [first] = barrier.recordAccepted(1, ["boundary"])
    const [second] = barrier.recordAccepted(2, ["boundary"])

    expect(barrier.acknowledgeApplied(first)).toBe(true)
    expect(barrier.acknowledgeApplied(first)).toBe(false)
    expect(errorCode(() => barrier.acknowledgeApplied({
      ...second,
      sentOrdinal: 3,
    }))).toBe("acknowledgement_ahead")
    expect(errorCode(() => barrier.acknowledgeApplied({
      ...second,
      acceptanceSequence: 1,
    }))).toBe("invalid_acknowledgement")

    expect(barrier.acknowledgeApplied(second)).toBe(true)
    expect(errorCode(() => barrier.acknowledgeApplied(first))).toBe("acknowledgement_regression")
  })

  test("rejects open or malformed control-plane data without changing the frontier", () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-closed")

    expect(errorCode(() => barrier.recordAccepted(2, ["boundary"]))).toBe("invalid_acceptance_sequence")
    expect(errorCode(() => barrier.recordAccepted(1, ["boundary", "boundary"]))).toBe("invalid_destinations")
    const [receipt] = barrier.recordAccepted(1, ["boundary"])
    const openReceipt = {...receipt, diagnostic: true}
    expect(errorCode(() => barrier.acknowledgeApplied(openReceipt))).toBe("invalid_acknowledgement")
    expect(errorCode(() => barrier.acknowledgeApplied({
      ...receipt,
      cutId: "other-cut",
    }))).toBe("invalid_acknowledgement")
    expect(barrier.frontier().domains.find(({domain}) => domain === "boundary")).toMatchObject({
      sentOrdinal: 1,
      appliedOrdinal: 0,
    })
  })

  test("keeps sequence 0 as an explicit unresolved live-baseline gate", async () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-zero")
    expect(await rejectionCode(barrier.holdUnderClosedAdmission())).toBe(
      "sequence_zero_baseline_unresolved",
    )
    expect(barrier.frontier()).toMatchObject({
      phase: "open",
      acceptanceSequence: 0,
    })
  })

  test("aborts a pending hold without changing delivery or applied frontiers", async () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-abort")
    const [receipt] = barrier.recordAccepted(1, ["energy"])
    const controller = new AbortController()
    const hold = barrier.holdUnderClosedAdmission(controller.signal)
    controller.abort()

    expect(await rejectionCode(hold)).toBe("barrier_aborted")
    expect(barrier.frontier()).toMatchObject({
      phase: "open",
      acceptanceSequence: 1,
    })
    expect(barrier.acknowledgeApplied(receipt)).toBe(true)
  })

  test("does not expose mutable internal receipt state", () => {
    const barrier = new CheckpointAppliedThroughBarrier("cut-copy")
    const receipts = barrier.recordAccepted(1, ["bulk"])
    const external = receipts[0] as CheckpointDeliveryReceipt & {acceptanceSequence: number}
    external.acceptanceSequence = 99

    expect(barrier.acknowledgeApplied({
      cutId: "cut-copy",
      domain: "bulk",
      sentOrdinal: 1,
      acceptanceSequence: 1,
    })).toBe(true)
  })
})
