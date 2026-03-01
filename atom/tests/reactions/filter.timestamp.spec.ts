import { reactionsFromSchema } from "../../src/reactions"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { reactionsSchema } from "../../../meta/reactions"
import type { JsonPatch } from "../../em.t"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по временной метке (timestamp)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/fields", value: 1 }

  it("простое сравнение числа", () => {
    const mass: { called: boolean } = { called: false }
    const timestamp = Date.now()
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: 2000 }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
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
            .filter(({ self }) => ({ timestamp: 1000 }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
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
    const timestamp = Date.now()
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { eq: 2000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
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
            .filter(({ self }) => ({ timestamp: { notEq: 1000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
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

  it("условие gt (больше)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { gt: 1000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при gt условии").toBe(true)
  })

  it("условие gte (больше или равно)", () => {
    const mass: { called: boolean } = { called: false }
    const timestamp = 2000
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { gte: 2000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при gte условии").toBe(true)
  })

  it("условие lt (меньше)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { lt: 3000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при lt условии").toBe(true)
  })

  it("условие lte (меньше или равно)", () => {
    const mass: { called: boolean } = { called: false }
    const timestamp = 2000
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { lte: 2000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при lte условии").toBe(true)
  })

  it("условие notGt (не больше)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { notGt: 3000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notGt условии").toBe(true)
  })

  it("условие notGte (не больше или равно)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { notGte: 3000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notGte условии").toBe(true)
  })

  it("условие notLt (не меньше)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { notLt: 1000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notLt условии").toBe(true)
  })

  it("условие notLte (не меньше или равно)", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { notLte: 1000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при notLte условии").toBe(true)
  })

  it("условие between", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { between: [1000, 3000] } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
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
              timestamp: {
                gte: 1000,
                lt: 3000,
                notEq: 1500,
              },
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
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

  it("обработка undefined значения", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { eq: 0 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 0,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при undefined timestamp (преобразуется в 0)").toBe(true)
  })

  it("фильтрация по времени (последняя минута)", () => {
    const mass: { called: boolean } = { called: false }
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { gte: Date.now() - 60000 } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: now,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать для сообщений последней минуты").toBe(true)
  })

  it("фильтрация по диапазону времени", () => {
    const mass: { called: boolean } = { called: false }
    const startTime = 1000
    const endTime = 3000
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ timestamp: { between: [1000, 3000] } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: 2000,
      patch: fakePatch,
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать для сообщений в диапазоне времени").toBe(true)
  })
})
