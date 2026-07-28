import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {BulkPresentedSnapshot} from "./observer-snapshot.ts"

const snapshot = (throughTs: number, rootSrc: string): BulkObserverSnapshot => ({
  version: 1,
  throughTs,
  rootSrc,
  projection: {
    runtime: {
      atoms: [],
      topologies: [],
      wimps: [],
      fields: [],
      states: [],
      transitions: [],
      conditions: [],
      processes: [],
      reactions: [],
      atomStates: [],
      fieldEnumVariants: [],
      atomValues: [],
      values: [],
      valueItems: [],
      matterParticles: [],
      matterTopologyBindingPaths: [],
      matterChildWimpBindingPaths: [],
    },
    declarations: [],
  },
})

describe("Bulk presented structural snapshot", () => {
  test("publishes only after the normal frame boundary and coalesces to its newest cut", async () => {
    const frames: FrameRequestCallback[] = []
    const presented = new BulkPresentedSnapshot((callback) => {
      frames.push(callback)
      return frames.length
    })
    const first = snapshot(10, "root/first")
    const second = snapshot(11, "root/second")

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
    expect(await read).toEqual(snapshot(11, "root/second"))
    expect(firstReads).toBe(0)
    expect(secondReads).toBe(1)
  })

  test("returns independent compatible snapshots and schedules no persistent loop", async () => {
    const frames: FrameRequestCallback[] = []
    const presented = new BulkPresentedSnapshot((callback) => {
      frames.push(callback)
      return frames.length
    })

    expect(await presented.read()).toBeNull()
    presented.stage(() => snapshot(20, "root"))
    frames[0]!(1)
    const firstRead = await presented.read()
    expect(firstRead).toEqual(snapshot(20, "root"))
    firstRead!.rootSrc = "caller/mutation"
    expect(await presented.read()).toEqual(snapshot(20, "root"))
    expect(frames).toHaveLength(1)
  })
})
