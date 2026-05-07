import {describe, expect, test} from "bun:test"
import {parseBoolean, parseNonNegativeInteger} from "./config.ts"

describe("parseBoolean", () => {
  test("accepts common true and false strings", () => {
    expect(parseBoolean("yes", false)).toBe(true)
    expect(parseBoolean("ON", false)).toBe(true)
    expect(parseBoolean("0", true)).toBe(false)
    expect(parseBoolean("off", true)).toBe(false)
  })

  test("falls back for missing or unknown values", () => {
    expect(parseBoolean(undefined, true)).toBe(true)
    expect(parseBoolean("maybe", false)).toBe(false)
  })
})

describe("parseNonNegativeInteger", () => {
  test("returns non-negative integers", () => {
    expect(parseNonNegativeInteger("0", 5)).toBe(0)
    expect(parseNonNegativeInteger("42", 5)).toBe(42)
  })

  test("falls back for invalid numbers", () => {
    expect(parseNonNegativeInteger("-1", 5)).toBe(5)
    expect(parseNonNegativeInteger("1.5", 5)).toBe(5)
    expect(parseNonNegativeInteger("nope", 5)).toBe(5)
  })
})
