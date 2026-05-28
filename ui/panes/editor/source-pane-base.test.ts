import {describe, expect, test} from "bun:test"
import {sourceDisplayLocation, sourcePathFromLocation} from "./source-pane-base.ts"

describe("sourcePathFromLocation", () => {
  test("strips a trailing line number from absolute paths", () => {
    expect(sourcePathFromLocation("/abs/file.ts:12")).toBe("/abs/file.ts")
  })

  test("keeps file URL scheme while stripping the line number", () => {
    expect(sourcePathFromLocation("file:///abs/file.ts:12")).toBe("file:///abs/file.ts")
  })

  test("returns strings without colon unchanged", () => {
    expect(sourcePathFromLocation("/abs/file.ts")).toBe("/abs/file.ts")
  })

  test("handles empty and undefined input", () => {
    expect(sourcePathFromLocation("")).toBe("")
    expect(sourcePathFromLocation(undefined)).toBe("")
  })
})

describe("sourceDisplayLocation", () => {
  test("keeps the useful tail of an absolute source location", () => {
    expect(sourceDisplayLocation("/Users/me/project/dark/server.spec.ts:22")).toBe("dark/server.spec.ts:22")
  })

  test("drops sourcemap one-letter prefixes from display", () => {
    expect(sourceDisplayLocation("r/dark/server.spec.ts:22")).toBe("dark/server.spec.ts:22")
  })

  test("compacts file URL locations", () => {
    expect(sourceDisplayLocation("file:///Users/me/project/dark/server.spec.ts:22")).toBe("dark/server.spec.ts:22")
  })
})
