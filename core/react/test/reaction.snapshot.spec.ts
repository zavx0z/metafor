import { test, expect, describe } from "bun:test"
import { createReactionsSnapshot, deserializeReactions } from "../index"
import { Context } from "@zavx0z/context"

describe("снимок реакций", () => {
  const { schema } = new Context((t) => ({
    value: t.number.required(0),
    name: t.string.required(""),
    isActive: t.boolean.required(false),
    tags: t.array.required([]),
  }))
  type Ctx = typeof schema
  type State = "idle" | "active" | "error"

  test("Создание уникальных реакций", () => {
    const snapshot = createReactionsSnapshot<typeof schema, State, {}>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "inc", description: "increment value" })
          .filter({
            meta: "test",
            op: "replace",
            path: "/context",
            value: 1,
          })
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ title: "reset" })
          .filter({ meta: "any" })
          .equal(({ update }) => update({ value: 0 })),
      ],
    ])
    expect(snapshot).toMatchObject({
      reactions: {
        inc_0: {
          title: "inc",
          desc: "increment value",
          cond: {
            meta: "test",
            op: "replace",
            path: "/context",
            value: 1,
          },
          read: ["value"],
          write: ["value"],
          src: expect.any(String),
        },
        reset_1: {
          title: "reset",
          cond: {
            meta: "any",
          },
          read: ["value"],
          write: ["value"],
          src: expect.any(String),
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
    const snapshot = createReactionsSnapshot<typeof schema, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: "test" })
          .equal(({ update }) => update({ value: 42 })),
      ],
    ])

    // Проверяем, что reactions - это объект, а не массив
    expect(typeof snapshot.reactions, "reactions должен быть объектом").toBe("object")
    expect(Array.isArray(snapshot.reactions), "reactions не должен быть массивом").toBe(false)

    // Проверяем структуру первой реакции
    const reactionIds = Object.keys(snapshot.reactions)
    expect(reactionIds.length, "должна быть хотя бы одна реакция").toBeGreaterThan(0)
    const reactionId = reactionIds[0]!
    const reaction = snapshot.reactions[reactionId]!

    expect(reaction.title, "реакция должна иметь title").toBe("test")
    expect(reaction.cond, "реакция должна иметь filter").toEqual({ meta: "test" })
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

    const snapshot = createReactionsSnapshot<typeof schema, State, {}>((reaction) => [
      [["idle"], reaction({ title: "double" }).filter({ meta: "test" }).equal(updateFn)],
    ])
    const reactionIds = Object.keys(snapshot.reactions)
    const reactionId = reactionIds[0]!
    const reaction = snapshot.reactions[reactionId]!

    expect(reaction.src, "сохранено строковое представление функции equal").toBe(updateFn.toString())
    expect(reaction.read, "прочитаны поля контекста").toEqual(["value"])
    expect(reaction.write, "записаны поля контекста").toEqual(["value"])
  })
})
