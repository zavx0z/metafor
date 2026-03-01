import { reactionsFromSchema } from "../../src/reactions"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../em.t"
import { reactionsSchema } from "../../../meta/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по атому", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/fields", value: 1 }

  it("простое сравнение", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ atom: "5" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "5",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при точном совпадении").toBe(true)
  })

  it("не срабатывает при несовпадении", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ atom: "5" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "10",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция не должна сработать при несовпадении").toBe(false)
  })

  it("условие eq", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ atom: { eq: "5" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "5",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при eq условии").toBe(true)
  })

  it("условие notEq", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(() => ({ atom: { notEq: "10" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "5",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notEq условии").toBe(true)
  })
})
