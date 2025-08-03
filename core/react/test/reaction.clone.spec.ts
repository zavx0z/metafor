import { Reactions, ReactionsClone } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("ReactionRegistryClone", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("создание из снимка", () => {
    // Создаем оригинальный реестр
    const originalRegistry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test_reaction" })
          .filter({ tag: "test" })
          .equal(() => {}),
      ],
      [
        ["active"],
        reaction({ title: "another_reaction", description: "Описание" })
          .filter({ op: "add" })
          .equal(() => {}),
      ],
    ])

    // Создаем снимок
    const snapshot = originalRegistry.toSnapshot()

    // Создаем клон из снимка
    const clonedRegistry = ReactionsClone.fromSnapshot<Ctx, State, {}>(snapshot)

    // Проверяем, что структура сохранена
    expect(clonedRegistry.hasReactions(), "клон должен содержать реакции").toBe(true)
    expect(clonedRegistry.getAllReactions().length, "количество реакций должно совпадать").toBe(2)

    // Проверяем реакции
    const reactions = clonedRegistry.getAllReactions()
    expect(reactions[0]!.title, "название первой реакции должно совпадать").toBe("test_reaction")
    expect(reactions[1]!.title, "название второй реакции должно совпадать").toBe("another_reaction")
    expect(reactions[1]!.description, "описание должно сохраниться").toBe("Описание")

    // Проверяем состояния
    const idleReactions = clonedRegistry.getReactions("idle")
    const activeReactions = clonedRegistry.getReactions("active")
    expect(idleReactions.length, "должна быть одна реакция для idle").toBe(1)
    expect(activeReactions.length, "должна быть одна реакция для active").toBe(1)
    expect(idleReactions[0]!.title, "реакция для idle должна быть правильной").toBe("test_reaction")
    expect(activeReactions[0]!.title, "реакция для active должна быть правильной").toBe("another_reaction")

    // Проверяем, что реакции не выполняются (заглушки)
    let called = false
    const testUpdate = () => (called = true)

    // Заменяем заглушку на реальную функцию для тестирования
    reactions[0]!.update = testUpdate

    clonedRegistry.run({
      state: "idle",
      context: fakeContext,
      core: {},
      meta: { tag: "test", timestamp: Date.now(), index: 0 },
      patch: fakePatch,
      update: fakeUpdate,
    })

    // Реакция не должна сработать, так как filter возвращает false
    expect(called, "реакция не должна сработать с заглушкой фильтра").toBe(false)
  })

  it("пустой снимок", () => {
    const emptySnapshot = { reactions: {}, states: {} }
    const clonedRegistry = ReactionsClone.fromSnapshot<Ctx, State, {}>(emptySnapshot)

    expect(clonedRegistry.hasReactions(), "пустой клон не должен содержать реакции").toBe(false)
    expect(clonedRegistry.getAllReactions().length, "количество реакций должно быть 0").toBe(0)
  })

  it("снимок с метаданными", () => {
    const snapshotWithMetadata = {
      reactions: {
        reaction_1: {
          title: "test",
          desc: "description",
          cond: { tag: "test" },
          read: ["value"],
          write: ["value"],
        },
      },
      states: {
        idle: ["reaction_1"],
      },
    }

    const clonedRegistry = ReactionsClone.fromSnapshot<Ctx, State, {}>(snapshotWithMetadata)

    expect(clonedRegistry.hasReactions(), "клон должен содержать реакции").toBe(true)

    const reactions = clonedRegistry.getAllReactions()
    expect(reactions[0]!.title, "название должно сохраниться").toBe("test")
    expect(reactions[0]!.description, "описание должно сохраниться").toBe("description")

    // Проверяем, что состояния правильно связаны
    const idleReactions = clonedRegistry.getReactions("idle")
    expect(idleReactions.length, "должна быть одна реакция для idle").toBe(1)
    expect(idleReactions[0]!.title, "реакция должна быть правильной").toBe("test")
  })
})
