import {describe, expect, test} from "bun:test"
import {
  BREAKPOINTS_STORAGE_KEY,
  LEGACY_BREAKPOINTS_STORAGE_KEY,
  mergeProcessBreakpointSpecs,
  readProcessBreakpointSpecs,
  removeProcessBreakpointSpec,
  writeProcessBreakpointSpecs,
} from "./breakpoint-storage.ts"

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe("interpreter web breakpoint storage", () => {
  test("keeps breakpoint specs isolated by process", () => {
    const storage = new MemoryStorage()

    writeProcessBreakpointSpecs(storage, "app-web-server.ts", [
      {url: "/repo/boundary/sqlite.ts", line: 358},
    ])
    writeProcessBreakpointSpecs(storage, "dark-server.spec.ts", [
      {url: "/repo/dark/server.ts", line: 20},
    ])

    expect(readProcessBreakpointSpecs(storage, "app-web-server.ts")).toEqual([
      {url: "/repo/boundary/sqlite.ts", line: 358},
    ])
    expect(readProcessBreakpointSpecs(storage, "dark-server.spec.ts")).toEqual([
      {url: "/repo/dark/server.ts", line: 20},
    ])
  })

  test("uses legacy v1 specs only until a process bucket exists", () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_BREAKPOINTS_STORAGE_KEY, JSON.stringify([
      {url: "/repo/boundary/sqlite.ts", line: 358},
    ]))

    expect(readProcessBreakpointSpecs(storage, "app-web-server.ts")).toEqual([
      {url: "/repo/boundary/sqlite.ts", line: 358},
    ])

    writeProcessBreakpointSpecs(storage, "app-web-server.ts", [
      {url: "/repo/boundary/sqlite.ts", line: 360},
    ])

    expect(readProcessBreakpointSpecs(storage, "app-web-server.ts")).toEqual([
      {url: "/repo/boundary/sqlite.ts", line: 360},
    ])
    expect(storage.getItem(BREAKPOINTS_STORAGE_KEY)).toContain("app-web-server.ts")
  })

  test("merge and remove preserve other process buckets", () => {
    const storage = new MemoryStorage()
    writeProcessBreakpointSpecs(storage, "app-web-server.ts", [
      {url: "/repo/boundary/sqlite.ts", line: 358},
    ])
    writeProcessBreakpointSpecs(storage, "dark-server.spec.ts", [
      {url: "/repo/dark/server.ts", line: 20},
    ])

    mergeProcessBreakpointSpecs(storage, "app-web-server.ts", [
      {url: "/repo/boundary/sqlite.ts", line: 358},
      {url: "/repo/boundary/sqlite.ts", line: 420},
    ])
    removeProcessBreakpointSpec(storage, "app-web-server.ts", {url: "/repo/boundary/sqlite.ts", line: 358})

    expect(readProcessBreakpointSpecs(storage, "app-web-server.ts")).toEqual([
      {url: "/repo/boundary/sqlite.ts", line: 420},
    ])
    expect(readProcessBreakpointSpecs(storage, "dark-server.spec.ts")).toEqual([
      {url: "/repo/dark/server.ts", line: 20},
    ])
  })
})
