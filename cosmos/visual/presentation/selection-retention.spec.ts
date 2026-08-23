import {describe, expect, test} from "bun:test"
import {shouldRetainMissingLocalWindowSelection} from "./selection-retention.ts"

describe("Hamiltonian transient local selection retention", () => {
  const localWindow = "window:device:local-tab"

  test("retains only the executing Window while it is absent from a snapshot", () => {
    expect(shouldRetainMissingLocalWindowSelection(
      [localWindow],
      localWindow,
      new Set(["hamiltonian:host"]),
    )).toBeTrue()
  })

  test("stops retaining after the local Window reappears", () => {
    expect(shouldRetainMissingLocalWindowSelection(
      [localWindow],
      localWindow,
      new Set([localWindow]),
    )).toBeFalse()
  })

  test("does not retain an unrelated disappeared node", () => {
    expect(shouldRetainMissingLocalWindowSelection(
      ["bun:main-probe"],
      localWindow,
      new Set(["hamiltonian:host"]),
    )).toBeFalse()
  })
})
