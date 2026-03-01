import { test, describe, expect } from "bun:test"
import { reactionsFromSchema } from "../../src/reactions.ts"
import { contextSchema } from "@zavx0z/context"

describe("deserializeReactions", () => {
  const schema = contextSchema((field) => ({
    value: field.number.required(0),
    name: field.string.required(""),
    isActive: field.boolean.required(false),
  }))
  type C = typeof schema
  type S = "idle" | "active" | "error"

  test("десериализация реакций из snapshot", () => {
    const snapshot = {
      reactions: {
        increment_0: {
          label: "increment",
          desc: "Increment value",
          cond: '({ self }) => ({ meta: "test", op: "replace", path: "/fields" })',
          read: ["value"],
          write: ["value"],
          src: "({ update, fields }) => update({ value: fields.value + 1 })",
        },
        reset_1: {
          label: "reset",
          cond: '({ self }) => ({ meta: "admin" })',
          read: ["value"],
          write: ["value"],
          src: "({ update }) => update({ value: 0 })",
        },
      },
      superposition: {
        idle: ["increment_0"],
        active: ["increment_0", "reset_1"],
        error: ["reset_1"],
      },
    }

    const reactions = reactionsFromSchema<C, S, {}>(snapshot)

    expect(reactions.exists(), "должны быть реакции").toBe(true)

    const allReactions = reactions.getAll()
    expect(allReactions.length, "должно быть 2 реакции").toBe(2)
    expect(allReactions[0]?.label, "название первой реакции должно сохраниться").toBe("increment")
    expect(allReactions[1]?.label, "название второй реакции должно сохраниться").toBe("reset")

    const idleReactions = reactions.get("idle")
    expect(idleReactions.length, "должна быть 1 реакция для idle").toBe(1)
    expect(idleReactions[0]?.label, "реакция для idle должна быть increment").toBe("increment")

    const activeReactions = reactions.get("active")
    expect(activeReactions.length, "должно быть 2 реакции для active").toBe(2)

    const errorReactions = reactions.get("error")
    expect(errorReactions.length, "должна быть 1 реакция для error").toBe(1)
    expect(errorReactions[0]?.label, "реакция для error должна быть reset").toBe("reset")
  })

  test("выполнение восстановленных реакций", () => {
    const snapshot = {
      reactions: {
        test_0: {
          label: "test",
          cond: '({ self }) => ({ meta: "test", op: "replace" })',
          read: ["value"],
          write: ["value"],
          src: "({ update, fields, patch }) => update({ value: fields.value + patch.value })",
        },
      },
      superposition: {
        idle: ["test_0"],
      },
    }

    const reactions = reactionsFromSchema<C, S, {}>(snapshot)

    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    const mockContext = { value: 5, name: "test", isActive: true }
    const mockPatch = { op: "replace", path: "/fields", value: 3 } as const

    // Выполняем реакцию
    reactions.run({
      state: "idle",
      fields: mockContext,
      mass: {},
      meta: "test",
      atom: "0",
      timestamp: Date.now(),
      patch: mockPatch,
      update: mockUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(updatedContext.value, "реакция должна обновить контекст").toBe(8)
  })

  test("фильтрация реакций по условиям", () => {
    const snapshot = {
      reactions: {
        meta_test_0: {
          label: "meta_test",
          cond: '({ self }) => ({ meta: "specific_meta" })',
          read: [],
          write: ["value"],
          src: "({ update }) => update({ value: 100 })",
        },
        op_test_1: {
          label: "op_test",
          cond: '({ self }) => ({ op: "add" })',
          read: [],
          write: ["value"],
          src: "({ update }) => update({ value: 200 })",
        },
      },
      superposition: {
        idle: ["meta_test_0", "op_test_1"],
      },
    }

    const reactions = reactionsFromSchema<C, S, {}>(snapshot)

    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    const mockContext = { value: 0, name: "test", isActive: true }

    // Тест 1: реакция должна сработать при совпадении meta
    reactions.run({
      state: "idle",
      fields: mockContext,
      mass: {},
      meta: "specific_meta",
      atom: "0",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/fields", value: 1 },
      update: mockUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(updatedContext.value, "реакция должна сработать при совпадении meta").toBe(100)

    // Сброс контекста
    updatedContext = {}

    // Тест 2: реакция должна сработать при совпадении op
    reactions.run({
      state: "idle",
      fields: mockContext,
      mass: {},
      meta: "other_meta",
      atom: "0",
      timestamp: Date.now(),
      patch: { op: "add", path: "/fields", value: 1 },
      update: mockUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(updatedContext.value, "реакция должна сработать при совпадении op").toBe(200)

    // Сброс контекста
    updatedContext = {}

    // Тест 3: реакции не должны сработать при несовпадении условий
    reactions.run({
      state: "idle",
      fields: mockContext,
      mass: {},
      meta: "other_meta",
      atom: "0",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/fields", value: 1 },
      update: mockUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(updatedContext.value, "реакции не должны сработать при несовпадении условий").toBeUndefined()
  })

  test("пустой snapshot", () => {
    const snapshot = {
      reactions: {},
      superposition: {},
    }

    const reactions = reactionsFromSchema<C, S, {}>(snapshot)

    expect(reactions.exists(), "не должно быть реакций").toBe(false)
    expect(reactions.getAll(), "список реакций должен быть пустым").toEqual([])
    expect(reactions.get("idle"), "реакции для idle должны быть пустыми").toEqual([])
  })
})
