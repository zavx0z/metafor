import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../dsl/meta/reactions"
import { describe, it, expect } from "bun:test"

type State = "idle" | "active"

describe("Фильтрация реакций", () => {
  it("реакция должна сработать", () => {
    const mass: { called: boolean } = { called: false }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: "test" }))
            .equal(({ mass }) => {
              mass.called = true
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      fields: {},
      state: "idle",
      mass,
      update: () => ({}),
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать").toBe(true)
  })
})
