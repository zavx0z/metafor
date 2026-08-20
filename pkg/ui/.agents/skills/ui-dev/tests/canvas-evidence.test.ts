import {describe, expect, test} from "bun:test"
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  acceptCanvasEvidence,
  classifyCanvasPixels,
  type RawCanvasSnapshot,
} from "../scripts/canvas-evidence.ts"

const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString("base64")}`

describe("canvas pixel evidence", () => {
  test("classifies only RGB content with visible alpha", () => {
    expect(classifyCanvasPixels({width: 2, height: 1, rgba: [0, 0, 0, 255, 0, 3, 0, 0]})).toEqual({
      width: 2,
      height: 1,
      pixels: 2,
      nonBlackPixels: 0,
      maxRgb: 0,
      black: true,
    })
    expect(classifyCanvasPixels({width: 1, height: 1, rgba: [0, 3, 0, 1]}).black).toBe(false)
    expect(classifyCanvasPixels({width: 1, height: 1, rgba: [0, 0, 0, 255]}).black).toBe(true)
  })

  test("refuses a black snapshot without writing its destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-canvas-evidence-"))
    const destination = join(root, "black.png")
    try {
      const result = await acceptCanvasEvidence({
        destination,
        snapshot: async () => snapshot([0, 0, 0, 255]),
      })

      expect(result).toMatchObject({
        kind: "starting-or-idle-black",
        written: false,
        attempts: 1,
        rendererActivity: null,
      })
      expect(await Bun.file(destination).exists()).toBe(false)
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  test("does not overwrite or delete a pre-existing destination after black refusal", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-canvas-evidence-"))
    const destination = join(root, "existing.png")
    const previous = new Uint8Array([9, 8, 7])
    try {
      await writeFile(destination, previous)
      const result = await acceptCanvasEvidence({
        destination,
        snapshot: async () => snapshot([0, 0, 0, 255]),
      })

      expect(result.written).toBe(false)
      expect([...await readFile(destination)]).toEqual([...previous])
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  test("accepts the second non-black snapshot after exactly one renderer-activity retry", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-canvas-evidence-"))
    const destination = join(root, "accepted.png")
    let captures = 0
    let activity = 0
    try {
      const result = await acceptCanvasEvidence({
        destination,
        snapshot: async () => ++captures === 1
          ? snapshot([0, 0, 0, 255])
          : snapshot([0, 0, 7, 255]),
        retryAfterBlack: async () => { activity++ },
      })

      expect(captures).toBe(2)
      expect(activity).toBe(1)
      expect(result).toMatchObject({
        kind: "exact-canvas-png",
        written: true,
        attempts: 2,
        rendererActivity: "same-route-navigation",
        rejected: [{attempt: 1, kind: "starting-or-idle-black"}],
        probe: {black: false, nonBlackPixels: 1},
      })
      expect([...await readFile(destination)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
      expect(await readdir(root)).toEqual(["accepted.png"])
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  test("bounds two black snapshots and leaves no successful PNG", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-canvas-evidence-"))
    const destination = join(root, "still-black.png")
    let captures = 0
    let activity = 0
    try {
      const result = await acceptCanvasEvidence({
        destination,
        snapshot: async () => { captures++; return snapshot([0, 0, 0, 255]) },
        retryAfterBlack: async () => { activity++ },
      })

      expect(captures).toBe(2)
      expect(activity).toBe(1)
      expect(result).toMatchObject({
        kind: "starting-or-idle-black",
        written: false,
        attempts: 2,
        rendererActivity: "same-route-navigation",
        rejected: [
          {attempt: 1, kind: "starting-or-idle-black"},
          {attempt: 2, kind: "starting-or-idle-black"},
        ],
      })
      expect(await Bun.file(destination).exists()).toBe(false)
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })
})

function snapshot(rgba: readonly number[]): RawCanvasSnapshot {
  return {
    dataUrl: png,
    probe: {width: 1, height: 1, rgba},
  }
}
