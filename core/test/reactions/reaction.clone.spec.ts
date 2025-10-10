import { reactionsFromSchema } from "../../reactions"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../../actor.t"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("deserializeReactions", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("создание из снимка", () => {
    // Создаем снимок напрямую
    const snapshot = {
      reactions: {
        test_reaction_0: {
          label: "test_reaction",
          cond: '({ self }) => ({ meta: "test" })',
          read: ["value"],
          write: ["value"],
          src: "({ update }) => update({ value: 100 })",
        },
        another_reaction_1: {
          label: "another_reaction",
          desc: "Описание",
          cond: '({ self }) => ({ op: "add" })',
          read: ["value"],
          write: ["value"],
          src: "({ update }) => update({ value: 200 })",
        },
      },
      states: {
        idle: ["test_reaction_0"],
        active: ["another_reaction_1"],
      },
    }

    // Создаем десериализованные реакции из снимка
    const deserializedReactions = reactionsFromSchema<Ctx, State, {}>(snapshot as any)

    // Проверяем, что структура сохранена
    expect(deserializedReactions.hasReactions(), "десериализованные реакции должны содержать реакции").toBe(true)
    expect(deserializedReactions.getAllReactions().length, "количество реакций должно совпадать").toBe(2)

    // Проверяем реакции
    const reactions = deserializedReactions.getAllReactions()
    expect(reactions[0]!.label, "название первой реакции должно совпадать").toBe("test_reaction")
    expect(reactions[1]!.label, "название второй реакции должно совпадать").toBe("another_reaction")
    expect(reactions[1]!.desc, "описание должно сохраниться").toBe("Описание")

    // Проверяем состояния
    const idleReactions = deserializedReactions.getReactions("idle")
    const activeReactions = deserializedReactions.getReactions("active")
    expect(idleReactions.length, "должна быть одна реакция для idle").toBe(1)
    expect(activeReactions.length, "должна быть одна реакция для active").toBe(1)
    expect(idleReactions[0]!.label, "реакция для idle должна быть правильной").toBe("test_reaction")
    expect(activeReactions[0]!.label, "реакция для active должна быть правильной").toBe("another_reaction")

    // Проверяем выполнение реакций
    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    deserializedReactions.run({
      state: "idle",
      context: fakeContext,
      core: {},
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      update: mockUpdate,
      self: { meta: "test", actor: "test-actor" },
    })

    // Реакция должна сработать и обновить контекст
    expect(updatedContext.value, "реакция должна обновить контекст").toBe(100)
  })

  it("пустой снимок", () => {
    const emptySnapshot = { reactions: {}, states: {} }
    const deserializedReactions = reactionsFromSchema<Ctx, State, {}>(emptySnapshot)

    expect(deserializedReactions.hasReactions(), "пустые десериализованные реакции не должны содержать реакции").toBe(
      false
    )
    expect(deserializedReactions.getAllReactions().length, "количество реакций должно быть 0").toBe(0)
  })

  it("снимок с метаданными", () => {
    const snapshotWithMetadata = {
      reactions: {
        reaction_1: {
          label: "test",
          desc: "description",
          cond: '({ self }) => ({ meta: "test" })',
          read: ["value"],
          write: ["value"],
          src: "({ update }) => update({ value: 42 })",
        },
      },
      states: {
        idle: ["reaction_1"],
      },
    }

    const deserializedReactions = reactionsFromSchema<Ctx, State, {}>(snapshotWithMetadata)

    expect(deserializedReactions.hasReactions(), "десериализованные реакции должны содержать реакции").toBe(true)

    const reactions = deserializedReactions.getAllReactions()
    expect(reactions[0]!.label, "название должно сохраниться").toBe("test")
    expect(reactions[0]!.desc, "описание должно сохраниться").toBe("description")

    // Проверяем, что состояния правильно связаны
    const idleReactions = deserializedReactions.getReactions("idle")
    expect(idleReactions.length, "должна быть одна реакция для idle").toBe(1)
    expect(idleReactions[0]!.label, "реакция должна быть правильной").toBe("test")

    // Проверяем выполнение реакции
    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    deserializedReactions.run({
      state: "idle",
      context: fakeContext,
      core: {},
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      update: mockUpdate,
      self: { meta: "test", actor: "test-actor" },
    })

    expect(updatedContext.value, "реакция должна обновить контекст").toBe(42)
  })
})
