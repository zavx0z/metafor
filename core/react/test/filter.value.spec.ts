import { deserializeReactions } from "../index"
import { contextSchema, type Update, type Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { reactionsSchema } from "../../../schema/reactions"

const schema = contextSchema((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type Ctx = typeof schema
type State = "idle" | "active"

describe("Фильтрация по значению патча (value) - расширенные условия", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakeMeta = "test"

  describe("Строковые значения", () => {
    it("прямое сравнение строки", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: "active" })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении строки").toBe(true)
    })

    it("регулярное выражение", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: /^user_\d+$/ })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_123" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при соответствии регулярному выражению").toBe(true)
    })

    it("условие eq", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { eq: "active" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии eq").toBe(true)
    })

    it("условие notEq", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { notEq: "inactive" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии notEq").toBe(true)
    })

    it("условие startsWith", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { startsWith: "user_" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_123" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии startsWith").toBe(true)
    })

    it("условие endsWith", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { endsWith: "_active" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_active" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии endsWith").toBe(true)
    })

    it("условие include", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { include: "error" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_error_123" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии include").toBe(true)
    })

    it("условие notInclude", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { notInclude: "error" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_success" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии notInclude").toBe(true)
    })

    it("условие pattern", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { pattern: /^\d{3}$/ } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "123" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии pattern").toBe(true)
    })

    it("условие length (число)", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: 5 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "hello" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии length (число)").toBe(true)
    })

    it("условие length (объект с min/max)", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: { min: 3, max: 10 } } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "hello" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии length (min/max)").toBe(true)
    })

    it("условие between", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { between: ["a", "z"] } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "hello" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии between").toBe(true)
    })
  })

  describe("Числовые значения", () => {
    it("прямое сравнение числа", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: 42 })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении числа").toBe(true)
    })

    it("условие eq", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { eq: 42 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии eq").toBe(true)
    })

    it("условие gt", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { gt: 10 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии gt").toBe(true)
    })

    it("условие gte", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { gte: 42 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии gte").toBe(true)
    })

    it("условие lt", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { lt: 100 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии lt").toBe(true)
    })

    it("условие lte", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { lte: 42 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии lte").toBe(true)
    })

    it("условие between", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { between: [10, 100] } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии between").toBe(true)
    })
  })

  describe("Булевы значения", () => {
    it("прямое сравнение булева значения", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: true })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: true },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении булева значения").toBe(true)
    })

    it("условие eq", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { eq: true } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: true },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии eq для булева значения").toBe(true)
    })

    it("условие logicalEq", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { logicalEq: true } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: true },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии logicalEq").toBe(true)
    })
  })

  describe("Массивы", () => {
    it("прямое сравнение массива", () => {
      const core: { called: boolean } = { called: false }
      const testArray = [1, 2, 3]
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: testArray })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: testArray },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении массива").toBe(true)
    })

    it("условие length (число)", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: 3 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: [1, 2, 3] },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии length для массива").toBe(true)
    })

    it("условие includes", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { includes: "item" } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: ["item", "other"] },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии includes").toBe(true)
    })

    it("условие isEmpty", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { isEmpty: true } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: [] },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии isEmpty").toBe(true)
    })

    it("условие every для чисел", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { every: { gt: 0 } } as any })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: [1, 2, 3] },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии every для чисел").toBe(true)
    })

    it("условие some для строк", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { some: { include: "error" } } as any })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: ["success", "error_123", "other"] },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии some для строк").toBe(true)
    })
  })

  describe("Null и undefined", () => {
    it("прямое сравнение null", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: null })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: null },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении null").toBe(true)
    })

    it("прямое сравнение undefined", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: undefined as any })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: undefined },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении undefined").toBe(true)
    })

    it("условие null в объекте", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { null: true } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: null },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при условии null в объекте").toBe(true)
    })
  })

  describe("Объекты", () => {
    it("прямое сравнение объекта", () => {
      const core: { called: boolean } = { called: false }
      const testObject = { name: "test", value: 42 }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: testObject as any })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: testObject },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при прямом сравнении объекта").toBe(true)
    })

    it("сложный объект", () => {
      const core: { called: boolean } = { called: false }
      const complexObject = {
        user: {
          id: 123,
          name: "John",
          settings: {
            theme: "dark",
            notifications: true,
          },
        },
      }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: complexObject as any })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: complexObject },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при сложном объекте").toBe(true)
    })
  })

  describe("Комбинированные условия", () => {
    it("комбинация с операцией и путем", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({
                value: { gt: 10, lt: 100 },
                op: "replace",
                path: "/context",
              })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 42 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при комбинированных условиях").toBe(true)
    })

    it("комбинация строковых условий", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({
                value: { startsWith: "user_", include: "active" },
              })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: "user_active_123" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция должна сработать при комбинации строковых условий").toBe(true)
    })
  })

  describe("Отрицательные тесты", () => {
    it("не срабатывает при несовпадении строки", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: "active" })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "inactive" },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция не должна сработать при несовпадении строки").toBe(false)
    })

    it("не срабатывает при несовпадении числа", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { gt: 100 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: 50 },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция не должна сработать при несовпадении числа").toBe(false)
    })

    it("не срабатывает при несовпадении массива", () => {
      const core: { called: boolean } = { called: false }
      const registry = deserializeReactions(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: 5 } })
              .equal(({ core }) => (core.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        actor: { index: 0 },
        timestamp: Date.now(),
        patch: { op: "replace", path: "/context", value: [1, 2, 3] },
        context: fakeContext,
        state: "idle",
        core,
        update: fakeUpdate,
      })

      expect(core.called, "реакция не должна сработать при несовпадении длины массива").toBe(false)
    })
  })
})
