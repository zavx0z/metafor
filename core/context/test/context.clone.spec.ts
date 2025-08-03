import { describe, it, expect } from "bun:test"
import { Context, ContextClone } from "../index"

describe("ContextClone", () => {
  it("создание из снимка", () => {
    // Создаем оригинальный контекст
    const originalContext = new Context((types) => ({
      name: types.string.required("Гость"),
      age: types.number.optional(),
      isActive: types.boolean.required(true),
      role: types.enum("user", "admin").required("user"),
    }))

    // Обновляем значения
    originalContext.update({ name: "Иван", age: 25 })

    // Создаем снимок
    const snapshot = originalContext.toSnapshot()
    const valuesSnapshot = originalContext.getSnapshot()

    // Создаем клон из снимка
    const clonedContext = ContextClone.fromSnapshot(snapshot)
    clonedContext.restoreValues(valuesSnapshot)

    // Проверяем, что структура сохранена
    expect(clonedContext.context.name, "имя должно сохраниться").toBe("Иван")
    expect(clonedContext.context.age, "возраст должен сохраниться").toBe(25)
    expect(clonedContext.context.isActive, "isActive должен сохраниться").toBe(true)
    expect(clonedContext.context.role, "роль должна сохраниться").toBe("user")

    // Проверяем схему
    expect(clonedContext.schema.name.type, "тип name должен сохраниться").toBe("string")
    expect(clonedContext.schema.age.type, "тип age должен сохраниться").toBe("number")
    expect(clonedContext.schema.isActive.type, "тип isActive должен сохраниться").toBe("boolean")
    expect(clonedContext.schema.role.type, "тип role должен сохраниться").toBe("enum")
  })

  it("обновление клонированного контекста", () => {
    const originalContext = new Context((types) => ({
      name: types.string.required("Гость"),
      age: types.number.optional(),
    }))

    const snapshot = originalContext.toSnapshot()
    const clonedContext = ContextClone.fromSnapshot(snapshot)
    clonedContext.restoreValues(originalContext.getSnapshot())

    // Обновляем клонированный контекст
    const updated = clonedContext.update({ name: "Новое имя", age: 30 })

    expect(updated.name, "возвращенное имя должно быть обновлено").toBe("Новое имя")
    expect(updated.age, "возвращенный возраст должен быть обновлен").toBe(30)
    expect(clonedContext.context.name, "контекст должен обновиться").toBe("Новое имя")
    expect(clonedContext.context.age, "контекст должен обновиться").toBe(30)
  })

  it("пустой снимок", () => {
    const emptySnapshot = {}
    const clonedContext = ContextClone.fromSnapshot(emptySnapshot)

    expect(clonedContext.context as any, "пустой контекст должен быть пустым объектом").toEqual({})
    expect(clonedContext.schema, "пустая схема должна быть пустым объектом").toEqual({})
  })

  it("снимок с метаданными", () => {
    const snapshotWithMetadata: any = {
      name: {
        type: "string" as const,
        required: true,
        default: "Гость",
        title: "Имя пользователя",
      },
      age: {
        type: "number" as const,
        required: false,
        title: "Возраст",
      },
    }

    const clonedContext = ContextClone.fromSnapshot(snapshotWithMetadata)

    expect(clonedContext.schema.name.type, "тип должен сохраниться").toBe("string")
    expect(clonedContext.schema.name.required, "required должен сохраниться").toBe(true)
    expect(clonedContext.schema.name.default, "default должен сохраниться").toBe("Гость")
    expect(clonedContext.schema.name.title, "title должен сохраниться").toBe("Имя пользователя")
    expect(clonedContext.schema.age.type, "тип должен сохраниться").toBe("number")
    expect(clonedContext.schema.age.required, "required должен сохраниться").toBe(false)
    expect(clonedContext.schema.age.title, "title должен сохраниться").toBe("Возраст")
  })

  it("подписка на обновления", () => {
    const originalContext = new Context((types) => ({
      name: types.string.required("Гость"),
    }))

    const snapshot = originalContext.toSnapshot()
    const clonedContext = ContextClone.fromSnapshot(snapshot)
    clonedContext.restoreValues(originalContext.getSnapshot())

    let updateCount = 0
    let lastUpdate: any = null

    const unsubscribe = clonedContext.onUpdate((updated) => {
      updateCount++
      lastUpdate = updated
    })

    // Обновляем контекст
    clonedContext.update({ name: "Новое имя" })

    expect(updateCount, "должно быть одно обновление").toBe(1)
    expect(lastUpdate.name, "последнее обновление должно содержать новое имя").toBe("Новое имя")

    // Отписываемся
    unsubscribe()
    clonedContext.update({ name: "Другое имя" })

    expect(updateCount, "не должно быть новых обновлений после отписки").toBe(1)
  })
})
