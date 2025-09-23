import { test, describe, expect } from "bun:test"
import { deserializeReactions } from "../index.ts"
import { Context } from "@zavx0z/context"

describe("deserializeReactions", () => {
  const { schema } = new Context((t) => ({
    value: t.number.required(0),
    name: t.string.required(""),
    isActive: t.boolean.required(false),
  }))
  type C = typeof schema
  type S = "idle" | "active" | "error"

  test("десериализация реакций из snapshot", () => {
    const snapshot = {
      reactions: {
        "increment_0": {
          title: "increment",
          desc: "Increment value",
          cond: {
            meta: "test",
            op: "replace",
            path: "/context"
          },
          read: ["value"],
          write: ["value"],
          src: "({ update, context }) => update({ value: context.value + 1 })"
        },
        "reset_1": {
          title: "reset",
          cond: {
            meta: "admin"
          },
          read: ["value"],
          write: ["value"],
          src: "({ update }) => update({ value: 0 })"
        }
      },
      states: {
        "idle": ["increment_0"],
        "active": ["increment_0", "reset_1"],
        "error": ["reset_1"]
      }
    }

    const reactions = deserializeReactions<C, S, {}>(snapshot)

    expect(reactions.hasReactions(), "должны быть реакции").toBe(true)

    const allReactions = reactions.getAllReactions()
    expect(allReactions.length, "должно быть 2 реакции").toBe(2)
    expect(allReactions[0]?.title, "название первой реакции должно сохраниться").toBe("increment")
    expect(allReactions[1]?.title, "название второй реакции должно сохраниться").toBe("reset")

    const idleReactions = reactions.getReactions("idle")
    expect(idleReactions.length, "должна быть 1 реакция для idle").toBe(1)
    expect(idleReactions[0]?.title, "реакция для idle должна быть increment").toBe("increment")

    const activeReactions = reactions.getReactions("active")
    expect(activeReactions.length, "должно быть 2 реакции для active").toBe(2)

    const errorReactions = reactions.getReactions("error")
    expect(errorReactions.length, "должна быть 1 реакция для error").toBe(1)
    expect(errorReactions[0]?.title, "реакция для error должна быть reset").toBe("reset")
  })

  test("выполнение восстановленных реакций", () => {
    const snapshot = {
      reactions: {
        "test_0": {
          title: "test",
          cond: {
            meta: "test",
            op: "replace"
          },
          read: ["value"],
          write: ["value"],
          src: "({ update, context, patch }) => update({ value: context.value + patch.value })"
        }
      },
      states: {
        "idle": ["test_0"]
      }
    }

    const reactions = deserializeReactions<C, S, {}>(snapshot)

    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    const mockContext = { value: 5, name: "test", isActive: true }
    const mockPatch = { op: "replace", path: "/context", value: 3 }

    // Выполняем реакцию
    reactions.run({
      state: "idle",
      context: mockContext,
      core: {},
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: mockPatch,
      update: mockUpdate
    })

    expect(updatedContext.value, "реакция должна обновить контекст").toBe(8)
  })

  test("фильтрация реакций по условиям", () => {
    const snapshot = {
      reactions: {
        "meta_test_0": {
          title: "meta_test",
          cond: {
            meta: "specific_meta"
          },
          read: [],
          write: ["value"],
          src: "({ update }) => update({ value: 100 })"
        },
        "op_test_1": {
          title: "op_test",
          cond: {
            op: "add"
          },
          read: [],
          write: ["value"],
          src: "({ update }) => update({ value: 200 })"
        }
      },
      states: {
        "idle": ["meta_test_0", "op_test_1"]
      }
    }

    const reactions = deserializeReactions<C, S, {}>(snapshot)

    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    const mockContext = { value: 0, name: "test", isActive: true }

    // Тест 1: реакция должна сработать при совпадении meta
    reactions.run({
      state: "idle",
      context: mockContext,
      core: {},
      meta: "specific_meta",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      update: mockUpdate
    })

    expect(updatedContext.value, "реакция должна сработать при совпадении meta").toBe(100)

    // Сброс контекста
    updatedContext = {}

    // Тест 2: реакция должна сработать при совпадении op
    reactions.run({
      state: "idle",
      context: mockContext,
      core: {},
      meta: "other_meta",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "add", path: "/context", value: 1 },
      update: mockUpdate
    })

    expect(updatedContext.value, "реакция должна сработать при совпадении op").toBe(200)

    // Сброс контекста
    updatedContext = {}

    // Тест 3: реакции не должны сработать при несовпадении условий
    reactions.run({
      state: "idle",
      context: mockContext,
      core: {},
      meta: "other_meta",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      update: mockUpdate
    })

    expect(updatedContext.value, "реакции не должны сработать при несовпадении условий").toBeUndefined()
  })

  test("пустой snapshot", () => {
    const snapshot = {
      reactions: {},
      states: {}
    }

    const reactions = deserializeReactions<C, S, {}>(snapshot)

    expect(reactions.hasReactions(), "не должно быть реакций").toBe(false)
    expect(reactions.getAllReactions(), "список реакций должен быть пустым").toEqual([])
    expect(reactions.getReactions("idle"), "реакции для idle должны быть пустыми").toEqual([])
  })
})
