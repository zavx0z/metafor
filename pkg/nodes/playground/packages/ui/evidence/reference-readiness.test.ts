import {describe, expect, test} from "bun:test"
import {waitForReferenceFrame, type ReferenceTextureStatus} from "./reference-readiness.ts"

describe("Blender reference readiness", () => {
  test("publishes only after TextureLoader reaches ready and a later frame renders", async () => {
    const statuses: ReferenceTextureStatus[] = ["idle", "loading", "ready"]
    const events: string[] = []

    await waitForReferenceFrame({
      readStatus: () => {
        const status = statuses.shift() ?? "ready"
        events.push(`status:${status}`)
        return status
      },
      wait: async () => { events.push("poll") },
      renderNextFrame: async () => { events.push("frame") },
    })

    expect(events).toEqual([
      "status:idle",
      "poll",
      "status:loading",
      "poll",
      "status:ready",
      "frame",
    ])
  })

  test("fails within the bounded wait without rendering a false-ready frame", async () => {
    let now = 0
    let frames = 0

    await expect(waitForReferenceFrame({
      readStatus: () => "loading",
      timeoutMs: 10,
      pollMs: 5,
      now: () => now,
      wait: async (durationMs) => { now += durationMs },
      renderNextFrame: async () => { frames++ },
    })).rejects.toThrow("timed out after 10ms")
    expect(frames).toBe(0)
  })

  test("fails immediately when TextureLoader reports a failed texture", async () => {
    let waited = false
    let frames = 0

    await expect(waitForReferenceFrame({
      readStatus: () => "failed",
      wait: async () => { waited = true },
      renderNextFrame: async () => { frames++ },
    })).rejects.toThrow("failed to materialize")
    expect(waited).toBeFalse()
    expect(frames).toBe(0)
  })
})
