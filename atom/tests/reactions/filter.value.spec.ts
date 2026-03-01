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

describe("Фильтрация по значению патча (value) - расширенные условия", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakeMeta = "test"

  describe("Строковые значения", () => {
    it("прямое сравнение строки", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: "active" }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении строки").toBe(true)
    })

    it("регулярное выражение", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: /^user_\d+$/ }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_123" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при соответствии регулярному выражению").toBe(true)
    })

    it("условие eq", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { eq: "active" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии eq").toBe(true)
    })

    it("условие notEq", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { notEq: "inactive" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "active" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии notEq").toBe(true)
    })

    it("условие startsWith", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { startsWith: "user_" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_123" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии startsWith").toBe(true)
    })

    it("условие endsWith", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { endsWith: "_active" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_active" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии endsWith").toBe(true)
    })

    it("условие include", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { include: "error" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_error_123" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии include").toBe(true)
    })

    it("условие notInclude", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { notInclude: "error" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "user_success" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии notInclude").toBe(true)
    })

    it("условие pattern", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { pattern: /^\d{3}$/ } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "123" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии pattern").toBe(true)
    })

    it("условие length (число)", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { length: 5 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "hello" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии length (число)").toBe(true)
    })

    it("условие length (объект с min/max)", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { length: { min: 3, max: 10 } } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "hello" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии length (min/max)").toBe(true)
    })

    it("условие between", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { between: ["a", "z"] } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "hello" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии between").toBe(true)
    })
  })

  describe("Числовые значения", () => {
    it("прямое сравнение числа", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: 42 }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении числа").toBe(true)
    })

    it("условие eq", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { eq: 42 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии eq").toBe(true)
    })

    it("условие gt", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { gt: 10 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии gt").toBe(true)
    })

    it("условие gte", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { gte: 42 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии gte").toBe(true)
    })

    it("условие lt", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { lt: 100 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии lt").toBe(true)
    })

    it("условие lte", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { lte: 42 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии lte").toBe(true)
    })

    it("условие between", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { between: [10, 100] } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии between").toBe(true)
    })
  })

  describe("Булевы значения", () => {
    it("прямое сравнение булева значения", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: true }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: true },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении булева значения").toBe(true)
    })

    it("условие eq", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { eq: true } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: true },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии eq для булева значения").toBe(true)
    })

    it("условие logicalEq", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { logicalEq: true } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: true },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии logicalEq").toBe(true)
    })
  })

  describe("Массивы", () => {
    it("прямое сравнение массива", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: [1, 2, 3] }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: [1, 2, 3] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении массива").toBe(true)
    })

    it("условие length (число)", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { length: 3 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: [1, 2, 3] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии length для массива").toBe(true)
    })

    it("условие includes", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { includes: "item" } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: ["item", "other"] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии includes").toBe(true)
    })

    it("условие isEmpty", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { isEmpty: true } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: [] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии isEmpty").toBe(true)
    })

    it("условие every для чисел", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { every: { gt: 0 } } as any }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: [1, 2, 3] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии every для чисел").toBe(true)
    })

    it("условие some для строк", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { some: { include: "error" } } as any }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: ["success", "error_123", "other"] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии some для строк").toBe(true)
    })
  })

  describe("Null и undefined", () => {
    it("прямое сравнение null", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: null }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: null },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении null").toBe(true)
    })

    it("прямое сравнение undefined", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: undefined as any }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: undefined },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении undefined").toBe(true)
    })

    it("условие null в объекте", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { null: true } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: null },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при условии null в объекте").toBe(true)
    })
  })

  describe("Объекты", () => {
    it("прямое сравнение объекта", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { name: "test", value: 42 } as any }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: { name: "test", value: 42 } },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при прямом сравнении объекта").toBe(true)
    })

    it("сложный объект", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                value: {
                  user: {
                    id: 123,
                    name: "John",
                    settings: {
                      theme: "dark",
                      notifications: true,
                    },
                  },
                } as any,
              }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: {
          op: "replace",
          path: "/fields",
          value: {
            user: {
              id: 123,
              name: "John",
              settings: {
                theme: "dark",
                notifications: true,
              },
            },
          },
        },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при сложном объекте").toBe(true)
    })
  })

  describe("Комбинированные условия", () => {
    it("комбинация с операцией и путем", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                value: { gt: 10, lt: 100 },
                op: "replace",
                path: "/fields",
              }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 42 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при комбинированных условиях").toBe(true)
    })

    it("комбинация строковых условий", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({
                value: { startsWith: "user_", include: "active" },
              }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: "user_active_123" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция должна сработать при комбинации строковых условий").toBe(true)
    })
  })

  describe("Отрицательные тесты", () => {
    it("не срабатывает при несовпадении строки", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: "active" }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/state", value: "inactive" },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция не должна сработать при несовпадении строки").toBe(false)
    })

    it("не срабатывает при несовпадении числа", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { gt: 100 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: 50 },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция не должна сработать при несовпадении числа").toBe(false)
    })

    it("не срабатывает при несовпадении массива", () => {
      const mass: { called: boolean } = { called: false }
      const registry = reactionsFromSchema(
        reactionsSchema<{}, State, { called: boolean }>((reaction) => [
          [
            ["idle"],
            reaction({ label: "test" })
              .filter(({ self }) => ({ value: { length: 5 } }))
              .equal(({ mass }) => (mass.called = true)),
          ],
        ]) as any
      )

      registry.run({
        meta: fakeMeta,
        atom: "id",
        timestamp: Date.now(),
        patch: { op: "replace", path: "/fields", value: [1, 2, 3] },
        fields: fakeContext,
        state: "idle",
        mass,
        update: fakeUpdate,
        destroy: () => {},
        self: { meta: "test", atom: "test-atom", path: "0" },
      })

      expect(mass.called, "реакция не должна сработать при несовпадении длины массива").toBe(false)
    })
  })
})
