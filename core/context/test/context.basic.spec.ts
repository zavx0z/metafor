import { test, expect } from "bun:test"
import { Context } from "../index"

test("Создание контекста с базовыми типами", () => {
  const { context } = new Context((types) => ({
    name: types.string.required("Гость")({ title: "Имя пользователя" }),
    age: types.number.optional()({ title: "Возраст" }),
    isActive: types.boolean.required(true)({ title: "Активен" }),
    role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
    tags: types.array.optional()({ title: "Теги" }),
    description: types.string.optional(), // без title
  }))

  // Проверяем значения
  expect(context.name, "Поле name должно быть 'Гость'").toBe("Гость")
  expect(context.age, "Поле age должно быть null").toBe(null)
  expect(context.isActive, "Поле isActive должно быть true").toBe(true)
  expect(context.role, "Поле role должно быть 'user'").toBe("user")
  expect(context.tags, "Поле tags должно быть null").toBe(null)
  expect(context.description, "Поле description должно быть null").toBe(null)

  // Проверяем метаданные
  expect(context._title.name, "Метаданные name должны быть доступны").toBe("Имя пользователя")
  expect(context._title.age, "Метаданные age должны быть доступны").toBe("Возраст")
  expect(context._title.isActive, "Метаданные isActive должны быть доступны").toBe("Активен")
  expect(context._title.role, "Метаданные role должны быть доступны").toBe("Роль")
  expect(context._title.tags, "Метаданные tags должны быть доступны").toBe("Теги")
  expect(context._title.description, "Метаданные description должны быть пустой строкой").toBe("")
})
