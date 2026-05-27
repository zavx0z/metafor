import {describe, expect, test} from "bun:test"
import {matchesBreakpointSpec} from "./breakpoints.ts"

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
