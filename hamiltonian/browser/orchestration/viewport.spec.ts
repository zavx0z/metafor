import {describe, expect, test} from "bun:test"
import {parseHamiltonianViewport, serializeHamiltonianViewport} from "./viewport.ts"

describe("Hamiltonian observer viewport", () => {
  test("round-trips the exact pan and zoom state", () => {
    const viewport = {x: -123.5, y: 88.25, scale: 0.72}
    expect(parseHamiltonianViewport(serializeHamiltonianViewport(viewport))).toEqual(viewport)
  })

  test("treats corrupt, non-finite and non-positive storage as absent", () => {
    expect(parseHamiltonianViewport("not json")).toBeNull()
    expect(parseHamiltonianViewport(JSON.stringify({kind: "hamiltonian.viewport.v1", x: 0, y: 0, scale: 0}))).toBeNull()
    expect(parseHamiltonianViewport(JSON.stringify({kind: "hamiltonian.viewport.v1", x: "0", y: 0, scale: 1}))).toBeNull()
  })
})
