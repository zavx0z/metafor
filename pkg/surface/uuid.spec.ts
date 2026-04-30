import { describe, expect, test } from "bun:test"
import { deriveUuid } from "./uuid.ts"

describe("surface uuid", () => {
  test("deriveUuid строит стабильный UUID из канонических частей", () => {
    const first = deriveUuid("meta-field", "owner/src", "flag")
    const second = deriveUuid("meta-field", "owner/src", "flag")
    const other = deriveUuid("meta-field", "owner/src", "status")

    expect(first).toBe("b821efac-3568-53c8-9eb4-2466366a49de")
    expect(second).toBe(first)
    expect(other).not.toBe(first)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
