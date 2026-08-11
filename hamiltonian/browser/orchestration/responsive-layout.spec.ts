import {describe, expect, test} from "bun:test"
import {hamiltonianLayoutDirection, hamiltonianLayoutViewportKey} from "./responsive-layout.ts"

describe("Hamiltonian responsive layout direction", () => {
  test("uses RIGHT for landscape and square displays", () => {
    expect(hamiltonianLayoutDirection({width: 1_200, height: 600})).toBe("RIGHT")
    expect(hamiltonianLayoutDirection({width: 800, height: 800})).toBe("RIGHT")
  })

  test("uses DOWN for portrait displays", () => {
    expect(hamiltonianLayoutDirection({width: 600, height: 1_200})).toBe("DOWN")
  })

  test("distinguishes two sizes inside the same orientation", () => {
    expect(hamiltonianLayoutViewportKey({width: 390, height: 844}))
      .not.toBe(hamiltonianLayoutViewportKey({width: 722, height: 1088}))
    expect(hamiltonianLayoutViewportKey({width: 722, height: 1088}))
      .toBe("DOWN:722x1088")
  })
})
