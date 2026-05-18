import {describe, expect, test} from "bun:test"
import {sourcePathFromLocation} from "./source-card-base.ts"

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
