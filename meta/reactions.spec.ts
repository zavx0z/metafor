import { test, expect, describe } from "bun:test"

import { contextSchema } from "@zavx0z/context"
import { reactionsSchema } from "./reactions"

describe("схема реакций", () => {
  const schema = contextSchema((t) => ({
    value: t.number.required(0),
    name: t.string.required(""),
    isActive: t.boolean.required(false),
    tags: t.array.required([]),
  }))
  type State = "idle" | "active" | "error"

  test("Создание уникальных реакций", () => {
    const snapshot = reactionsSchema<typeof schema, State, {}>((reaction) => [
      [
        ["idle", "active"],
        reaction({ label: "inc", desc: "increment value" })
          .filter(() => ({
            meta: "test",
            op: "replace",
            path: "/context",
            value: 1,
          }))
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ label: "reset" })
          .filter(() => ({ meta: "any" }))
          .equal(({ update }) => update({ value: 0 })),
      ],
    ])
    expect(snapshot).toMatchObject({
      reactions: {
        0: {
          label: "inc",
          desc: "increment value",
          cond: expect.any(String),
          read: ["value"],
          write: ["value"],
          src: expect.any(String),
        },
        1: {
          label: "reset",
          cond: expect.any(String),
          read: ["value"],
          write: ["value"],
          src: expect.any(String),
        },
      },
      states: {
        idle: ["0"],
        active: ["0"],
        error: ["1"],
      },
    })
  })

  test("Проверка структуры данных toSnapshot", () => {
    const snapshot = reactionsSchema<typeof schema, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ label: "test" })
          .filter(() => ({ meta: "test" }))
          .equal(({ update }) => update({ value: 42 })),
      ],
    ])!

    // Проверяем, что reactions - это объект, а не массив
    expect(typeof snapshot.reactions, "reactions должен быть объектом").toBe("object")
    expect(Array.isArray(snapshot.reactions), "reactions не должен быть массивом").toBe(false)

    // Проверяем структуру первой реакции
    const reactionIds = Object.keys(snapshot.reactions)
    expect(reactionIds.length, "должна быть хотя бы одна реакция").toBeGreaterThan(0)
    const reactionId = reactionIds[0]!
    const reaction = snapshot.reactions[reactionId]!

    expect(reaction.label, "реакция должна иметь label").toBe("test")
    expect(reaction.read, "реакция должна иметь read").toEqual(["value"])
    expect(reaction.write, "реакция должна иметь write").toEqual(["value"])
    expect(reaction.src, "реакция должна иметь src").toEqual(expect.any(String))

    // Проверяем структуру states
    expect(snapshot.states, "states должен быть объектом").toEqual({
      idle: [reactionId],
    })
  })

  test("сохранение строкового представления функции equal", () => {
    const updateFn = ({ update, context }: any) => update({ value: context.value * 2 })

    const snapshot = reactionsSchema<typeof schema, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ label: "double" })
          .filter(() => ({ meta: "test" }))
          .equal(updateFn),
      ],
    ])!
    const reactionIds = Object.keys(snapshot.reactions)
    const reactionId = reactionIds[0]!
    const reaction = snapshot.reactions[reactionId]!

    expect(reaction.src, "сохранено строковое представление функции equal").toContain(
      updateFn.toString().replace(/\}\)$/, "")
    )
    expect(reaction.read, "прочитаны поля контекста").toEqual(["value"])
    expect(reaction.write, "записаны поля контекста").toEqual(["value"])
  })
})
