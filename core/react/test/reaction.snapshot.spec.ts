import { test, expect, describe } from "bun:test"
import { ReactionRegistry } from "../index"

describe("снимок реакций", () => {
  type Ctx = {
    value: { type: "number"; required: true }
    name: { type: "string"; required: true }
    isActive: { type: "boolean"; required: true }
    tags: { type: "array"; required: true }
  }
  type State = "idle" | "active" | "error"

  test("Создание уникальных реакций", () => {
    const registry = new ReactionRegistry<Ctx, State, {}>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "inc", description: "increment value" })
          .filter({
            tag: "test",
            op: "replace",
            path: "/context",
            value: 1,
          })
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ title: "reset" })
          .filter({ tag: "any" })
          .equal(({ update }) => update({ value: 0 })),
      ],
    ])

    const snapshot = registry.toSnapshot()
    expect(snapshot).toEqual({
      reactions: {
        inc_0: {
          title: "inc",
          desc: "increment value",
          cond: {
            tag: "test",
            op: "replace",
            path: "/context",
            value: 1,
          },
          read: ["value"],
          write: ["value"],
        },
        reset_1: {
          title: "reset",
          cond: {
            tag: "any",
          },
          read: ["value"],
          write: ["value"],
        },
      },
      states: {
        idle: ["inc_0"],
        active: ["inc_0"],
        error: ["reset_1"],
      },
    })
  })

  test("Проверка структуры данных toSnapshot", () => {
    const registry = new ReactionRegistry<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ tag: "test" })
          .equal(({ update }) => update({ value: 42 })),
      ],
    ])

    const snapshot = registry.toSnapshot()

    // Проверяем, что reactions - это объект, а не массив
    expect(typeof snapshot.reactions, "reactions должен быть объектом").toBe("object")
    expect(Array.isArray(snapshot.reactions), "reactions не должен быть массивом").toBe(false)

    // Проверяем структуру первой реакции
    const reactionIds = Object.keys(snapshot.reactions)
    expect(reactionIds.length, "должна быть хотя бы одна реакция").toBeGreaterThan(0)
    const reactionId = reactionIds[0]!
    const reaction = snapshot.reactions[reactionId]!

    expect(reaction.title, "реакция должна иметь title").toBe("test")
    expect(reaction.cond, "реакция должна иметь filter").toEqual({ tag: "test" })
    expect(reaction.read, "реакция должна иметь read").toEqual(["value"])
    expect(reaction.write, "реакция должна иметь write").toEqual(["value"])

    // Проверяем структуру states
    expect(snapshot.states, "states должен быть объектом").toEqual({
      idle: [reactionId],
    })
  })
})
