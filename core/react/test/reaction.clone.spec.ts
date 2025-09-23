import { Reactions, deserializeReactions } from "../index"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("deserializeReactions", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("создание из снимка", () => {
    // Создаем оригинальный реестр
    const originalRegistry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test_reaction" })
          .filter({ meta: "test" })
          .equal(({ update }) => update({ value: 100 })),
      ],
      [
        ["active"],
        reaction({ title: "another_reaction", description: "Описание" })
          .filter({ op: "add" })
          .equal(({ update }) => update({ value: 200 })),
      ],
    ])

    // Создаем снимок
    const snapshot = originalRegistry.toSnapshot()

    // Создаем десериализованные реакции из снимка
    const deserializedReactions = deserializeReactions<Ctx, State, {}>(snapshot)

    // Проверяем, что структура сохранена
    expect(deserializedReactions.hasReactions(), "десериализованные реакции должны содержать реакции").toBe(true)
    expect(deserializedReactions.getAllReactions().length, "количество реакций должно совпадать").toBe(2)

    // Проверяем реакции
    const reactions = deserializedReactions.getAllReactions()
    expect(reactions[0]!.title, "название первой реакции должно совпадать").toBe("test_reaction")
    expect(reactions[1]!.title, "название второй реакции должно совпадать").toBe("another_reaction")
    expect(reactions[1]!.description, "описание должно сохраниться").toBe("Описание")

    // Проверяем состояния
    const idleReactions = deserializedReactions.getReactions("idle")
    const activeReactions = deserializedReactions.getReactions("active")
    expect(idleReactions.length, "должна быть одна реакция для idle").toBe(1)
    expect(activeReactions.length, "должна быть одна реакция для active").toBe(1)
    expect(idleReactions[0]!.title, "реакция для idle должна быть правильной").toBe("test_reaction")
    expect(activeReactions[0]!.title, "реакция для active должна быть правильной").toBe("another_reaction")

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
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      update: mockUpdate,
    })

    // Реакция должна сработать и обновить контекст
    expect(updatedContext.value, "реакция должна обновить контекст").toBe(100)
  })

  it("пустой снимок", () => {
    const emptySnapshot = { reactions: {}, states: {} }
    const deserializedReactions = deserializeReactions<Ctx, State, {}>(emptySnapshot)

    expect(deserializedReactions.hasReactions(), "пустые десериализованные реакции не должны содержать реакции").toBe(false)
    expect(deserializedReactions.getAllReactions().length, "количество реакций должно быть 0").toBe(0)
  })

  it("снимок с метаданными", () => {
    const snapshotWithMetadata = {
      reactions: {
        reaction_1: {
          title: "test",
          desc: "description",
          cond: { meta: "test" },
          read: ["value"],
          write: ["value"],
          src: "({ update }) => update({ value: 42 })",
        },
      },
      states: {
        idle: ["reaction_1"],
      },
    }

    const deserializedReactions = deserializeReactions<Ctx, State, {}>(snapshotWithMetadata)

    expect(deserializedReactions.hasReactions(), "десериализованные реакции должны содержать реакции").toBe(true)

    const reactions = deserializedReactions.getAllReactions()
    expect(reactions[0]!.title, "название должно сохраниться").toBe("test")
    expect(reactions[0]!.description, "описание должно сохраниться").toBe("description")

    // Проверяем, что состояния правильно связаны
    const idleReactions = deserializedReactions.getReactions("idle")
    expect(idleReactions.length, "должна быть одна реакция для idle").toBe(1)
    expect(idleReactions[0]!.title, "реакция должна быть правильной").toBe("test")

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
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      update: mockUpdate,
    })

    expect(updatedContext.value, "реакция должна обновить контекст").toBe(42)
  })
})
