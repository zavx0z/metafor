import {describe, expect, test} from "bun:test"
import {hamiltonianLayoutDirection} from "./responsive-layout.ts"

describe("Hamiltonian responsive ELK direction", () => {
  test("uses RIGHT for landscape and square displays", () => {
    expect(hamiltonianLayoutDirection({width: 1_200, height: 600})).toBe("RIGHT")
    expect(hamiltonianLayoutDirection({width: 800, height: 800})).toBe("RIGHT")
  })

  test("uses DOWN for portrait displays", () => {
    expect(hamiltonianLayoutDirection({width: 600, height: 1_200})).toBe("DOWN")
  })
})
