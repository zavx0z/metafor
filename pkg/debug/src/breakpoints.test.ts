import {describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {logicalBreakpointParams, matchesBreakpointSpec, runtimeBreakpointParams} from "./breakpoints.ts"

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
})
