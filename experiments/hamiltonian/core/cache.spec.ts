import {describe, expect, test} from "bun:test"
import {responseMatchesHash, selectRetainedCaches, sha256Hex} from "./cache.js"

describe("version cache policy", () => {
  test("rehashes bytes and rejects a forged matching metadata header", async () => {
    const valid = new Response("expected bytes")
    const hash = await sha256Hex(valid.clone())
    const verified = new Response("expected bytes", {headers: {"x-hamiltonian-sha256": hash}})
    const corrupted = new Response("different bytes", {headers: {"x-hamiltonian-sha256": hash}})

    expect(await responseMatchesHash(verified, hash)).toBeTrue()
    expect(await responseMatchesHash(corrupted, hash)).toBeFalse()
  })

  test("retains the current and one deterministic rollback cache", () => {
    expect(selectRetainedCaches(
      ["hamiltonian-code:v1", "hamiltonian-code:v2", "hamiltonian-code:v3"],
      "hamiltonian-code:v3",
      "hamiltonian-code:v2",
    )).toEqual(["hamiltonian-code:v2", "hamiltonian-code:v3"])
  })
})
