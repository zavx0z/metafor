import {describe, expect, test} from "bun:test"
import {normalizeRemoteDesktopLifecycleRequest, remoteDesktopLifecycleSchema} from "./remote-desktop-lifecycle.ts"

describe("remote desktop lifecycle request", () => {
  test("defaults to read-only status over the whole contour", () => {
    const parsed = normalizeRemoteDesktopLifecycleRequest({})
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.action).toBe("status")
    expect(parsed.request.scope).toBe("all")
    expect(parsed.request.wait).toBe(true)
    expect(parsed.request.cleanProfile).toBe(false)
    expect(parsed.request.stopXvfb).toBe(false)
    expect(parsed.request.config.remoteDesktopDir).toContain("pkg/interpreter/remote-desktop")
  })

  test("uses sender as the safe restart default", () => {
    const parsed = normalizeRemoteDesktopLifecycleRequest({action: "restart"})
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.action).toBe("restart")
    expect(parsed.request.scope).toBe("sender")
  })

  test("keeps recover scoped to the full working session", () => {
    const parsed = normalizeRemoteDesktopLifecycleRequest({action: "recover", cleanProfile: true, timeoutMs: 200_000})
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.scope).toBe("all")
    expect(parsed.request.cleanProfile).toBe(true)
    expect(parsed.request.timeoutMs).toBe(90_000)
  })

  test("accepts the old appElectronDir override as a deprecated alias", () => {
    const parsed = normalizeRemoteDesktopLifecycleRequest({config: {appElectronDir: "/tmp/metafor-test-remote-desktop"}})
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain("config.remoteDesktopDir")
  })

  test("describes user-story level commands", () => {
    const schema = remoteDesktopLifecycleSchema()
    expect(schema.endpoint).toBe("/remote-desktop/lifecycle")
    expect(Array.isArray(schema.userStories)).toBe(true)
  })
})
