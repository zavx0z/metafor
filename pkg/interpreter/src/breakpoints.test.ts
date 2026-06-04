import {describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {BreakpointStore, logicalBreakpointParams, matchesBreakpointSpec, runtimeBreakpointParams} from "./breakpoints.ts"
import {EventLogger} from "./logger.ts"
import type {ProtocolClient} from "./protocol-client.ts"

describe("matchesBreakpointSpec", () => {
  test("matches file URL and absolute path variants", () => {
    expect(matchesBreakpointSpec(
      {url: "/repo/src/file.ts", line: 3},
      "file:///repo/src/file.ts",
    )).toBe(true)
  })

  test("matches pending local module paths against absolute script urls", () => {
    expect(matchesBreakpointSpec(
      {url: "dark/server.ts", line: 3},
      "file:///Users/me/project/dark/server.ts",
    )).toBe(true)
  })

  test("matches Bun source-map r prefix against absolute script urls", () => {
    expect(matchesBreakpointSpec(
      {url: "r/dark/server.ts", line: 3},
      "file:///Users/me/project/dark/server.ts",
    )).toBe(true)
  })

  test("matches urlRegex against script URL variants", () => {
    expect(matchesBreakpointSpec(
      {urlRegex: "src/file\\.ts$", line: 3},
      "file:///repo/src/file.ts",
    )).toBe(true)
  })

  test("ignores invalid regex specs", () => {
    expect(matchesBreakpointSpec(
      {urlRegex: "(", line: 3},
      "file:///repo/src/file.ts",
    )).toBe(false)
  })
})

describe("logicalBreakpointParams", () => {
  test("arms source-map source URLs before the script is parsed", () => {
    expect(logicalBreakpointParams({
      url: "/compiled/server.js",
      sourceUrl: "r/missing/server.ts",
      line: 20,
    })).toEqual({
      url: "r/missing/server.ts",
      lineNumber: 19,
      columnNumber: 0,
    })
  })

  test("preserves regex breakpoints for future script loads", () => {
    expect(logicalBreakpointParams({
      urlRegex: "dark/server\\.ts$",
      line: 3,
      column: 2,
      condition: "enabled",
    })).toEqual({
      urlRegex: "dark/server\\.ts$",
      lineNumber: 2,
      columnNumber: 2,
      condition: "enabled",
    })
  })

  test("defers local TypeScript breakpoints until scriptId source-map install", () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-bp-"))
    try {
      const file = join(dir, "server.ts")
      writeFileSync(file, "const value: number = 1\nconsole.log(value)\n")
      expect(logicalBreakpointParams({url: file, line: 2})).toBeNull()
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  test("pre-resolves local TypeScript source breakpoints to runtime coordinates", () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-bp-"))
    try {
      writeFileSync(join(dir, "server.ts"), [
        "import {join} from 'node:path'",
        "",
        "type State = {value: string}",
        "const state: State = {value: join('a', 'b')}",
        "console.log(state.value)",
        "",
      ].join("\n"))

      const params = runtimeBreakpointParams({url: "r/server.ts", line: 4}, dir)
      expect(params?.["url"]).toBe(join(dir, "server.ts"))
      expect(params?.["lineNumber"]).toBe(1)
      expect(params?.["columnNumber"]).toBe(0)
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  test("arms local TypeScript breakpoints before the script is parsed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-bp-"))
    try {
      const file = join(dir, "server.ts")
      writeFileSync(file, [
        "import {join} from 'node:path'",
        "",
        "type State = {value: string}",
        "const state: State = {value: join('a', 'b')}",
        "console.log(state.value)",
        "",
      ].join("\n"))

      const requests: Array<{method: string; params: Record<string, unknown> | undefined}> = []
      const client = {
        async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
          requests.push({method, params})
          if (method === "Debugger.setBreakpointByUrl") {
            return {
              breakpointId: "runtime:1",
              locations: [{scriptId: "future", lineNumber: 1, columnNumber: 0}],
            }
          }
          return {}
        },
      } as unknown as ProtocolClient
      const logger = new EventLogger(join(dir, "events.log"))
      const store = new BreakpointStore({client, logger})
      const registration = store.add({url: file, line: 4})

      await store.armPendingByUrl([registration.id])

      expect(requests[0]).toEqual({
        method: "Debugger.setBreakpointByUrl",
        params: {
          url: file,
          lineNumber: 1,
          columnNumber: 0,
        },
      })
      expect(requests.map((request) => request.method)).toContain("Debugger.setBreakpointsActive")
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})

describe("BreakpointStore", () => {
  test("removes local registrations when inspector remove fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-bp-"))
    try {
      const requests: Array<{method: string; params: Record<string, unknown> | undefined}> = []
      const client = {
        async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
          requests.push({method, params})
          if (method === "Debugger.setBreakpointByUrl") {
            return {
              breakpointId: "logical:1",
              locations: [{scriptId: "future", lineNumber: 2, columnNumber: 0}],
            }
          }
          if (method === "Debugger.removeBreakpoint") throw new Error("protocol socket closed")
          return {}
        },
      } as unknown as ProtocolClient
      const logger = new EventLogger(join(dir, "events.log"))
      const store = new BreakpointStore({client, logger})
      const registration = store.add({url: "https://example.test/app.js", line: 3})

      await store.armPendingByUrl([registration.id])
      expect(store.registrations[0]?.installed).toHaveLength(1)

      const removed = await store.remove(registration.id)

      expect("id" in removed ? removed.id : "").toBe(registration.id)
      expect(store.registrations).toEqual([])
      expect(requests.map((request) => request.method)).toContain("Debugger.removeBreakpoint")
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })

  test("clears stale installed breakpoint ids without removing specs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-bp-"))
    try {
      const client = {
        async request(method: string): Promise<unknown> {
          if (method === "Debugger.setBreakpointByUrl") {
            return {
              breakpointId: "logical:1",
              locations: [{scriptId: "future", lineNumber: 2, columnNumber: 0}],
            }
          }
          return {}
        },
      } as unknown as ProtocolClient
      const logger = new EventLogger(join(dir, "events.log"))
      const store = new BreakpointStore({client, logger})
      const registration = store.add({url: "https://example.test/app.js", line: 3})

      await store.armPendingByUrl([registration.id])
      store.clearInstalled("target.exited")

      expect(store.registrations).toEqual([{
        id: registration.id,
        spec: registration.spec,
        installed: [],
      }])
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
