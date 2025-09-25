import { deserializeReactions } from "../index"
import { contextSchema, type Update, type Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { serializeReaction } from "../../../schema/reactions"

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
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: "active" })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении строки").toBe(true)
    })

    it("регулярное выражение", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: /^user_\d+$/ })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при соответствии регулярному выражению").toBe(true)
    })

    it("условие eq", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { eq: "active" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии eq").toBe(true)
    })

    it("условие notEq", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { notEq: "inactive" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии notEq").toBe(true)
    })

    it("условие startsWith", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { startsWith: "user_" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии startsWith").toBe(true)
    })

    it("условие endsWith", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { endsWith: "_active" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии endsWith").toBe(true)
    })

    it("условие include", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { include: "error" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии include").toBe(true)
    })

    it("условие notInclude", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { notInclude: "error" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии notInclude").toBe(true)
    })

    it("условие pattern", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { pattern: /^\d{3}$/ } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии pattern").toBe(true)
    })

    it("условие length (число)", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: 5 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии length (число)").toBe(true)
    })

    it("условие length (объект с min/max)", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: { min: 3, max: 10 } } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии length (min/max)").toBe(true)
    })

    it("условие between", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { between: ["a", "z"] } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии between").toBe(true)
    })
  })

  describe("Числовые значения", () => {
    it("прямое сравнение числа", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: 42 })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении числа").toBe(true)
    })

    it("условие eq", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { eq: 42 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии eq").toBe(true)
    })

    it("условие gt", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { gt: 10 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии gt").toBe(true)
    })

    it("условие gte", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { gte: 42 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии gte").toBe(true)
    })

    it("условие lt", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { lt: 100 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии lt").toBe(true)
    })

    it("условие lte", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { lte: 42 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии lte").toBe(true)
    })

    it("условие between", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { between: [10, 100] } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии between").toBe(true)
    })
  })

  describe("Булевы значения", () => {
    it("прямое сравнение булева значения", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: true })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении булева значения").toBe(true)
    })

    it("условие eq", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { eq: true } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии eq для булева значения").toBe(true)
    })

    it("условие logicalEq", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { logicalEq: true } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии logicalEq").toBe(true)
    })
  })

  describe("Массивы", () => {
    it("прямое сравнение массива", () => {
      let called = false
      const testArray = [1, 2, 3]
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: testArray })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении массива").toBe(true)
    })

    it("условие length (число)", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: 3 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии length для массива").toBe(true)
    })

    it("условие includes", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { includes: "item" } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии includes").toBe(true)
    })

    it("условие isEmpty", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { isEmpty: true } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии isEmpty").toBe(true)
    })

    it("условие every для чисел", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { every: { gt: 0 } } as any })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии every для чисел").toBe(true)
    })

    it("условие some для строк", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { some: { include: "error" } } as any })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии some для строк").toBe(true)
    })
  })

  describe("Null и undefined", () => {
    it("прямое сравнение null", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: null })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении null").toBe(true)
    })

    it("прямое сравнение undefined", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: undefined as any })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении undefined").toBe(true)
    })

    it("условие null в объекте", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { null: true } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при условии null в объекте").toBe(true)
    })
  })

  describe("Объекты", () => {
    it("прямое сравнение объекта", () => {
      let called = false
      const testObject = { name: "test", value: 42 }
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: testObject as any })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при прямом сравнении объекта").toBe(true)
    })

    it("сложный объект", () => {
      let called = false
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
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: complexObject as any })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при сложном объекте").toBe(true)
    })
  })

  describe("Комбинированные условия", () => {
    it("комбинация с операцией и путем", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({
                value: { gt: 10, lt: 100 },
                op: "replace",
                path: "/context",
              })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при комбинированных условиях").toBe(true)
    })

    it("комбинация строковых условий", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({
                value: { startsWith: "user_", include: "active" },
              })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция должна сработать при комбинации строковых условий").toBe(true)
    })
  })

  describe("Отрицательные тесты", () => {
    it("не срабатывает при несовпадении строки", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: "active" })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция не должна сработать при несовпадении строки").toBe(false)
    })

    it("не срабатывает при несовпадении числа", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { gt: 100 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция не должна сработать при несовпадении числа").toBe(false)
    })

    it("не срабатывает при несовпадении массива", () => {
      let called = false
      const registry = deserializeReactions(
        serializeReaction((reaction) => [
          [
            ["idle"],
            reaction({ title: "test" })
              .filter({ value: { length: 5 } })
              .equal(() => (called = true)),
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
        core: {},
        update: fakeUpdate,
      })

      expect(called, "реакция не должна сработать при несовпадении длины массива").toBe(false)
    })
  })
})
