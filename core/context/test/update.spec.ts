import { describe, it, expect } from "bun:test"
import { Context } from "../index"

describe("update", () => {
  it("обновляет только переданные значения", () => {
    const { context, update } = new Context((types) => ({
      name: types.string.required("Гость"),
      nickname: types.string(),
      age: types.number.optional(),
    }))

    update({ name: "Иван" })
    expect(context.name, 'Поле name должно обновиться на "Иван"').toBe("Иван")
    expect(context.nickname, "Поле nickname должно остаться null").toBe(null)
    expect(context.age, "Поле age должно остаться null").toBe(null)

    update({ nickname: "nick", age: 25 })
    expect(context.name, 'Поле name должно остаться "Иван"').toBe("Иван")
    expect(context.nickname, 'Поле nickname должно обновиться на "nick"').toBe("nick")
    expect(context.age, "Поле age должно обновиться на 25").toBe(25)
  })

  it("игнорирует undefined значения", () => {
    const { context, update } = new Context((types) => ({
      name: types.string.required("Гость"),
      nickname: types.string(),
    }))

    // @ts-expect-error - TypeScript должен запрещать undefined
    update({ name: undefined })

    expect(context.name, 'Поле name должно остаться "Гость"').toBe("Гость")
  })

  it("позволяет устанавливать null для optional полей", () => {
    const { context, update } = new Context((types) => ({
      nickname: types.string(),
      age: types.number.optional(),
    }))

    update({ nickname: "test" })
    expect(context.nickname, 'Поле nickname должно обновиться на "test"').toBe("test")

    update({ nickname: null })
    expect(context.nickname, "Поле nickname должно обновиться на null").toBe(null)

    update({ age: 25 })
    expect(context.age, "Поле age должно обновиться на 25").toBe(25)

    update({ age: null })
    expect(context.age, "Поле age должно обновиться на null").toBe(null)
  })

  it("работает со всеми типами данных", () => {
    const { context, update } = new Context((types) => ({
      title: types.string.required("Заголовок"),
      description: types.string(),
      age: types.number.required(18),
      score: types.number(),
      isActive: types.boolean.required(true),
      isVerified: types.boolean(),
      status: types.enum("draft", "published", "archived").required("draft"),
      category: types.enum("tech", "design", "business")(),
      tags: types.array.required<string>([]),
      permissions: types.array(),
      flags: types.array(),
    }))

    update({
      title: "Новый заголовок",
      description: "Новое описание",
      age: 25,
      score: 100,
      isActive: false,
      isVerified: true,
      status: "published",
      category: "tech",
      tags: ["typescript", "library"],
      permissions: [1, 2, 3],
      flags: [true, false, true],
    })

    expect(context.title, 'Поле title должно обновиться на "Новый заголовок"').toBe("Новый заголовок")
    expect(context.description, 'Поле description должно обновиться на "Новое описание"').toBe("Новое описание")
    expect(context.age, "Поле age должно обновиться на 25").toBe(25)
    expect(context.score, "Поле score должно обновиться на 100").toBe(100)
    expect(context.isActive, "Поле isActive должно обновиться на false").toBe(false)
    expect(context.isVerified, "Поле isVerified должно обновиться на true").toBe(true)
    expect(context.status, 'Поле status должно обновиться на "published"').toBe("published")
    expect(context.category, 'Поле category должно обновиться на "tech"').toBe("tech")
    expect(context.tags, 'Поле tags должно обновиться на ["typescript", "library"]').toEqual(["typescript", "library"])
    expect(context.permissions, "Поле permissions должно обновиться на [1, 2, 3]").toEqual([1, 2, 3])
    expect(context.flags, "Поле flags должно обновиться на [true, false, true]").toEqual([true, false, true])
  })

  it("возвращает обновленный контекст", () => {
    const { update } = new Context((types) => ({
      name: types.string.required("Гость"),
      status: types.enum("start", "process", "end").required("start"),
      age: types.number.optional(),
    }))

    const updated = update({ name: "Иван", age: 25, status: "start" })

    expect(updated, "update должен возвращать ключи только с обновленными параметрами").toEqual({
      name: "Иван",
      age: 25,
    })
    expect(updated.name, 'Возвращенный контекст должен содержать обновленное имя "Иван"').toBe("Иван")
    expect(updated.age, "Возвращенный контекст должен содержать обновленный возраст 25").toBe(25)
    expect(updated.status, "Поле status не должно быть в возвращаемом объекте, так как не изменилось").toBeUndefined()
  })

  it("сохраняет иммутабельность после обновления", () => {
    const { context, update } = new Context((types) => ({
      name: types.string.required("Гость"),
      status: types.enum("start", "process", "end").required("start"),
    }))

    update({ name: "Новое имя" })

    expect(() => {
      ;(context as any).name = "Другое имя"
    }, "Должна быть ошибка при прямом изменении поля name после update").toThrow("Прямое изменение контекста запрещено")

    expect(() => {
      ;(context as any).status = "end"
    }, "Должна быть ошибка при прямом изменении поля status после update").toThrow(
      "Прямое изменение контекста запрещено"
    )
  })
})
