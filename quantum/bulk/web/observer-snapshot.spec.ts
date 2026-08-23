import {describe, expect, test} from "bun:test"
import type {BulkStoreCaptureProof} from "@metafor/types/bulk/capture"
import {BulkPresentedStoreProof} from "./observer-snapshot.ts"

const proof = (root: number): BulkStoreCaptureProof => ({
  root,
  rows: {dark: 1, field: 0, fieldAlias: 0, orbital: 0, proxy: 0, transition: 0, relation: 0, batch: 0},
  transitionBatchFingerprints: [],
  relationBatchFingerprints: [],
})

describe("Bulk presented Store proof", () => {
  test("publishes only after the normal frame boundary and coalesces to its newest cut", async () => {
    const frames: FrameRequestCallback[] = []
    const presented = new BulkPresentedStoreProof((callback) => {
      frames.push(callback)
      return frames.length
    })
    const first = proof(10)
    const second = proof(12)

    let firstReads = 0
    let secondReads = 0
    presented.stage(() => {
      firstReads += 1
      return first
    })
    presented.stage(() => {
      secondReads += 1
      return second
    })
    expect(frames).toHaveLength(1)

    let settled = false
    const read = presented.read().then((value) => {
      settled = true
      return value
    })
    await Bun.sleep(0)
    expect(settled).toBe(false)

    frames[0]!(123)
    expect(await read).toEqual(proof(12))
    expect(firstReads).toBe(0)
    expect(secondReads).toBe(1)
  })

  test("returns independent compatible proofs and schedules no persistent loop", async () => {
    const frames: FrameRequestCallback[] = []
    const presented = new BulkPresentedStoreProof((callback) => {
      frames.push(callback)
      return frames.length
    })

    expect(await presented.read()).toBeNull()
    presented.stage(() => proof(20))
    frames[0]!(1)
    const firstRead = await presented.read()
    expect(firstRead).toEqual(proof(20))
    firstRead!.root = 22
    expect(await presented.read()).toEqual(proof(20))
    expect(frames).toHaveLength(1)
  })
})
