import {describe, expect, test} from "bun:test"

describe("Force package public API", () => {
  test("exports only the domain transport client", async () => {
    const api = await import("force")

    expect(Object.keys(api)).toEqual(["Force"])
    expect(api.Force).toBeFunction()
  })
})
