import { test, expect } from "bun:test"
import { Context } from "../index"

test("Работа с метаданными контекста", () => {
  const { context } = new Context((types) => ({
    name: types.string.required("Гость")({ title: "Имя пользователя" }),
    age: types.number.optional(),
    isActive: types.boolean.required(true),
  }))

  // Проверяем начальные значения
  expect(context._title.name, "Начальный заголовок name").toBe("Имя пользователя")
  expect(context._title.age, "Начальный заголовок age должен быть пустой строкой").toBe("")
  expect(context._title.isActive, "Начальный заголовок isActive должен быть пустой строкой").toBe("")

  // Изменяем заголовки
  context._title.name = "Полное имя"
  context._title.age = "Возраст пользователя"
  context._title.isActive = "Статус активности"

  // Проверяем, что заголовки изменились
  expect(context._title.name, "Заголовок name должен измениться").toBe("Полное имя")
  expect(context._title.age, "Заголовок age должен измениться").toBe("Возраст пользователя")
  expect(context._title.isActive, "Заголовок isActive должен измениться").toBe("Статус активности")

  // Проверяем, что значения контекста не изменились
  expect(context.name, "Значение name не должно измениться").toBe("Гость")
  expect(context.age, "Значение age не должно измениться").toBe(null)
  expect(context.isActive, "Значение isActive не должно измениться").toBe(true)
}) 