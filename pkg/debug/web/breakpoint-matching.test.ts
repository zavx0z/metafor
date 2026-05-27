import {describe, expect, test} from "bun:test"
import {
  breakpointSpecMatchesModule,
  breakpointSpecMatchesSource,
  sameSourceUrl,
} from "./breakpoint-matching.ts"

describe("debug web breakpoint matching", () => {
  test("matches saved pending breakpoints against active source identity", () => {
    expect(breakpointSpecMatchesSource(
      {url: "r/dark/server.ts", line: 20},
      {
        scriptId: "",
        scriptUrl: "/Users/me/project/dark/server.ts",
        sourceUrl: "r/dark/server.ts",
        key: "r/dark/server.ts:0",
      },
    )).toBe(true)
  })

  test("matches module badge count and editor markers with the same suffix rule", () => {
    expect(breakpointSpecMatchesModule(
      {url: "r/dark/server.ts", line: 20},
      "dark/server.ts",
      "/Users/me/project/dark/server.ts",
    )).toBe(true)
  })

  test("normalizes Bun source-map r prefix for absolute paths", () => {
    expect(sameSourceUrl("r/dark/server.ts", "/Users/me/project/dark/server.ts")).toBe(true)
  })
})
