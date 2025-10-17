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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 4 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 4 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "admin" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "moderator" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "banned" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: 3 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "admin", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "moderator", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "active", actor: "test-actor", path: "0", destroy: () => {} },
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
        actor: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "banned", actor: "test-actor", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция НЕ должна сработать когда meta входит в исключающий массив").toBe(false)
    })
  })

  describe("Фильтрация по actor с in/notIn", () => {
    it("фильтр in для actor - значение входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ actor: { in: ["actor-1", "actor-2", "actor-3"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        actor: "actor-2",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "actor-2", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция должна сработать когда actor входит в массив").toBe(true)
    })

    it("фильтр in для actor - значение НЕ входит в массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ actor: { in: ["actor-1", "actor-2", "actor-3"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        actor: "actor-5",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "actor-5", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция НЕ должна сработать когда actor НЕ входит в массив").toBe(false)
    })

    it("фильтр notIn для actor - значение НЕ входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ actor: { notIn: ["blocked-1", "blocked-2"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        actor: "actor-3",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "actor-3", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция должна сработать когда actor НЕ входит в исключающий массив").toBe(true)
    })

    it("фильтр notIn для actor - значение входит в исключающий массив", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ actor: { notIn: ["blocked-1", "blocked-2"] } }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "test",
        actor: "blocked-1",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "test", actor: "blocked-1", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция НЕ должна сработать когда actor входит в исключающий массив").toBe(false)
    })
  })

  describe("Комбинированные фильтры meta и actor", () => {
    it("фильтр in для meta и actor одновременно", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                meta: { in: ["user", "admin"] },
                actor: { in: ["actor-1", "actor-2"] },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "admin",
        actor: "actor-2",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "admin", actor: "actor-2", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция должна сработать когда и meta, и actor входят в свои массивы").toBe(true)
    })

    it("фильтр in для meta и actor - meta не подходит", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                meta: { in: ["user", "admin"] },
                actor: { in: ["actor-1", "actor-2"] },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "moderator",
        actor: "actor-2",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "moderator", actor: "actor-2", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция НЕ должна сработать когда meta не входит в массив").toBe(false)
    })

    it("фильтр notIn для meta и actor одновременно", () => {
      const core: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                meta: { notIn: ["banned", "suspended"] },
                actor: { notIn: ["blocked-1", "blocked-2"] },
              }))
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: "active",
        actor: "actor-3",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "test" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
        self: { meta: "active", actor: "actor-3", path: "0", destroy: () => {} },
      })

      expect(core.called, "реакция должна сработать когда и meta, и actor НЕ входят в исключающие массивы").toBe(true)
    })
  })
})
