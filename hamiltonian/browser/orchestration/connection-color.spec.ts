import {describe, expect, test} from "bun:test"
import {
  HAMILTONIAN_CONNECTION_TYPES,
  hamiltonianConnectionColor,
} from "./connection-color.ts"

describe("Hamiltonian connection colors", () => {
  test("keeps every Hamiltonian transport family visually distinct", () => {
    const colors = HAMILTONIAN_CONNECTION_TYPES.map((connectionType) => {
      const {r, g, b} = hamiltonianConnectionColor(connectionType)
      return `${r}:${g}:${b}`
    })
    expect(new Set(colors).size).toBe(HAMILTONIAN_CONNECTION_TYPES.length)
  })

  test("uses the universal deterministic fallback for an unknown family", () => {
    expect(hamiltonianConnectionColor("custom-a"))
      .toEqual(hamiltonianConnectionColor("custom-a"))
    expect(hamiltonianConnectionColor("custom-a"))
      .not.toEqual(hamiltonianConnectionColor("custom-b"))
  })
})
