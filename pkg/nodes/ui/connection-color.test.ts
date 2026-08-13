import {describe, expect, test} from "bun:test"
import {palette} from "@ui/elements"
import {defaultNodeSystemConnectionColor} from "./connection-color.ts"

describe("node-system connection colors", () => {
  test("depends only on the semantic connection type", () => {
    const alpha = defaultNodeSystemConnectionColor("alpha")
    expect(defaultNodeSystemConnectionColor("alpha")).toEqual(alpha)
    expect(defaultNodeSystemConnectionColor("beta")).not.toEqual(alpha)
  })

  test("uses the neutral border for a connection without a semantic type", () => {
    expect(defaultNodeSystemConnectionColor(undefined)).toBe(palette.border)
  })
})
