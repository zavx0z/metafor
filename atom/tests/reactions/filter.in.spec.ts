import { reactionsFromSchema } from "../../src/reactions"
import { contextSchema, type Update, type Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { reactionsSchema } from "../../../meta/reactions"

const schema = contextSchema((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type Ctx = typeof schema
type State = "idle" | "active"

describe("Фильтрация по значению патча (value) - фильтры in/notIn", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakeMeta = "test"

  describe("Числовые значения", () => {
    it("фильтр in для чисел - значение входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { in: [1, 2, 3, 5, 8] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда значение входит в массив").toBe(true)
    })

    it("фильтр in для чисел - значение НЕ входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { in: [1, 2, 3, 5, 8] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 4 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда значение НЕ входит в массив").toBe(false)
    })

    it("фильтр notIn для чисел - значение НЕ входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { notIn: [0, 4, 6, 7] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда значение НЕ входит в исключающий массив").toBe(true)
    })

    it("фильтр notIn для чисел - значение входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { notIn: [0, 4, 6, 7] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 4 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда значение входит в исключающий массив").toBe(false)
    })
  })

  describe("Строковые значения", () => {
    it("фильтр in для строк - значение входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { in: ["user", "admin", "guest"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "admin" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда строковое значение входит в массив").toBe(true)
    })

    it("фильтр in для строк - значение НЕ входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { in: ["user", "admin", "guest"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "moderator" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда строковое значение НЕ входит в массив").toBe(false)
    })

    it("фильтр notIn для строк - значение НЕ входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { notIn: ["banned", "suspended"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда строковое значение НЕ входит в исключающий массив").toBe(true)
    })

    it("фильтр notIn для строк - значение входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { notIn: ["banned", "suspended"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "banned" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда строковое значение входит в исключающий массив").toBe(
        false
      )
    })
  })

  describe("Комбинированные условия", () => {
    it("фильтр in с другими условиями", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                value: {
                  in: [1, 2, 3, 5, 8],
                  gt: 2,
                },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда значение удовлетворяет всем условиям").toBe(true)
    })

    it("фильтр in с другими условиями - не удовлетворяет", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                value: {
                  in: [1, 2, 3, 5, 8],
                  gt: 5,
                },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда значение не удовлетворяет всем условиям").toBe(false)
    })
  })

  describe("Фильтрация по meta с in/notIn", () => {
    it("фильтр in для meta - значение входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ meta: { in: ["user", "admin", "guest"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "admin",
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "admin", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда meta входит в массив").toBe(true)
    })

    it("фильтр in для meta - значение НЕ входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ meta: { in: ["user", "admin", "guest"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "moderator",
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "moderator", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда meta НЕ входит в массив").toBe(false)
    })

    it("фильтр notIn для meta - значение НЕ входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ meta: { notIn: ["banned", "suspended"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "active",
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "active", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда meta НЕ входит в исключающий массив").toBe(true)
    })

    it("фильтр notIn для meta - значение входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ meta: { notIn: ["banned", "suspended"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "banned",
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "banned", atom: "test-atom", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда meta входит в исключающий массив").toBe(false)
    })
  })

  describe("Фильтрация по atom с in/notIn", () => {
    it("фильтр in для atom - значение входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ atom: { in: ["atom-1", "atom-2", "atom-3"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        atom: "atom-2",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "atom-2", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда atom входит в массив").toBe(true)
    })

    it("фильтр in для atom - значение НЕ входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ atom: { in: ["atom-1", "atom-2", "atom-3"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        atom: "atom-5",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "atom-5", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда atom НЕ входит в массив").toBe(false)
    })

    it("фильтр notIn для atom - значение НЕ входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ atom: { notIn: ["blocked-1", "blocked-2"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        atom: "atom-3",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "atom-3", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда atom НЕ входит в исключающий массив").toBe(true)
    })

    it("фильтр notIn для atom - значение входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ atom: { notIn: ["blocked-1", "blocked-2"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        atom: "blocked-1",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", atom: "blocked-1", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда atom входит в исключающий массив").toBe(false)
    })
  })

  describe("Комбинированные фильтры meta и atom", () => {
    it("фильтр in для meta и atom одновременно", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                meta: { in: ["user", "admin"] },
                atom: { in: ["atom-1", "atom-2"] },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "admin",
        atom: "atom-2",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "admin", atom: "atom-2", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда и meta, и atom входят в свои массивы").toBe(true)
    })

    it("фильтр in для meta и atom - meta не подходит", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                meta: { in: ["user", "admin"] },
                atom: { in: ["atom-1", "atom-2"] },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "moderator",
        atom: "atom-2",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "moderator", atom: "atom-2", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция НЕ должна сработать когда meta не входит в массив").toBe(false)
    })

    it("фильтр notIn для meta и atom одновременно", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                meta: { notIn: ["banned", "suspended"] },
                atom: { notIn: ["blocked-1", "blocked-2"] },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "active",
        atom: "atom-3",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "active", atom: "atom-3", path: "0" },
        destroy: () => {},
      })

      expect(core.called, "реакция должна сработать когда и meta, и atom НЕ входят в исключающие массивы").toBe(true)
    })
  })
})
