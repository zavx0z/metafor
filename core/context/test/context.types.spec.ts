import { test, expect } from "bun:test"
import { Context } from "../index"

test("Работа со всеми типами данных", () => {
  const { context } = new Context((types) => ({
    title: types.string.required("Заголовок"),
    description: types.string(),
    age: types.number.required(18),
    score: types.number(),
    isActive: types.boolean.required(true),
    isVerified: types.boolean(),
    role: types.enum("user", "admin", "moderator").required("user"),
    status: types.enum("pending", "approved", "rejected")(),
    tags: types.array.required(["default"]),
    categories: types.array(),
  }))

  // Проверяем строковые типы
  expect(context.title, "Поле title должно быть 'Заголовок'").toBe("Заголовок")
  expect(context.description, "Поле description должно быть null").toBe(null)

  // Проверяем числовые типы
  expect(context.age, "Поле age должно быть 18").toBe(18)
  expect(context.score, "Поле score должно быть null").toBe(null)

  // Проверяем булевые типы
  expect(context.isActive, "Поле isActive должно быть true").toBe(true)
  expect(context.isVerified, "Поле isVerified должно быть null").toBe(null)

  // Проверяем enum типы
  expect(context.role, "Поле role должно быть 'user'").toBe("user")
  expect(context.status, "Поле status должно быть null").toBe(null)

  // Проверяем массивные типы
  expect(context.tags, "Поле tags должно быть ['default']").toEqual(["default"])
  expect(context.categories, "Поле categories должно быть null").toBe(null)
})
