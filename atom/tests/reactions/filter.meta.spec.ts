import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../em.t"
import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../meta/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по мете атома (meta)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakePatch: JsonPatch = { op: "replace", path: "/fields", value: 1 }

  it("простое сравнение имени меты", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: "test" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
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
            .filter(({ self }) => ({ meta: "test" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "other",
      atom: "id",
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

  it("регулярное выражение", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: /^test_/ }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при совпадении с regex").toBe(true)
  })

  it("условие eq", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { eq: "test" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
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
            .filter(({ self }) => ({ meta: { notEq: "other" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
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

  it("условие startsWith", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { startsWith: "test" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при startsWith условии").toBe(true)
  })

  it("условие endsWith", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { endsWith: "component" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при endsWith условии").toBe(true)
  })

  it("условие include", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { include: "comp" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при include условии").toBe(true)
  })

  it("условие notInclude", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notInclude: "bad" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notInclude условии").toBe(true)
  })

  it("условие notStartsWith", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notStartsWith: "bad" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notStartsWith условии").toBe(true)
  })

  it("условие notEndsWith", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notEndsWith: "bad" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notEndsWith условии").toBe(true)
  })

  it("условие pattern (regex)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { pattern: /^test_\d+$/ } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_123",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при pattern условии").toBe(true)
  })

  it("условие length (число)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { length: 4 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при length условии (число)").toBe(true)
  })

  it("условие length (объект с min/max)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { length: { min: 3, max: 10 } } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при length условии (min/max)").toBe(true)
  })

  it("условие between", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { between: ["a", "z"] } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при between условии").toBe(true)
  })

  it("комбинированные условия", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              meta: {
                startsWith: "test",
                include: "comp",
                length: { min: 10, max: 20 },
              },
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      atom: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при комбинированных условиях").toBe(true)
  })
})
