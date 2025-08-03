import { describe, it, expect } from "bun:test"
import { Context } from "../index"

describe("Схема", () => {
  it("должен возвращать оригинальную схему через геттер", () => {
    const ctx = new Context((types) => ({
      name: types.string.required("Иван")({ title: "Имя пользователя" }),
      age: types.number.optional(),
      isActive: types.boolean.required(true)({ title: "Активен" }),
      role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
      tags: types.array.required([])({ title: "Теги" }),
      priority: types.enum("low", "medium", "high").optional()({ title: "Приоритет" }),
      description: types.string.optional()({ title: "Описание" }),
      metadata: types.array.optional()({ title: "Метаданные" }),
    }))

    // Получаем схему через геттер
    const result = ctx.schema
    // Проверяем что это объект схемы
    expect(typeof result).toBe("object")
    expect(result).not.toBeNull()
    expect(result).toEqual({
      name: {
        type: "string",
        required: true,
        default: "Иван",
        title: "Имя пользователя",
      },
      age: {
        type: "number",
        required: false,
        default: undefined,
      },
      isActive: {
        type: "boolean",
        required: true,
        default: true,
        title: "Активен",
      },
      role: {
        type: "enum",
        required: true,
        values: ["user", "admin", "moderator"],
        default: "user",
        title: "Роль",
      },
      tags: {
        type: "array",
        required: true,
        default: [],
        title: "Теги",
      },
      priority: {
        type: "enum",
        required: false,
        default: undefined,
        values: ["low", "medium", "high"],
        title: "Приоритет",
      },
      description: {
        type: "string",
        required: false,
        default: undefined,
        title: "Описание",
      },
      metadata: {
        type: "array",
        required: false,
        default: undefined,
        title: "Метаданные",
      },
    })
  })

  it("должен сохранять типизацию схемы", () => {
    const ctx = new Context((types) => ({
      name: types.string.required("Иван")({ title: "Имя пользователя" }),
      age: types.number.optional(),
      role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
      isActive: types.boolean.required(true)({ title: "Активен" }),
      description: types.string.optional()({ title: "Описание" }),
      priority: types.enum("low", "medium", "high").optional()({ title: "Приоритет" }),
      tags: types.array.optional()({ title: "Теги" }),
    }))

    // Проверяем типизацию - TypeScript должен знать точные типы
    const schema = ctx.schema

    // Проверяем required поля
    expect(schema.name.type).toBe("string")
    expect(schema.name.required).toBe(true)
    expect(schema.name.default).toBe("Иван")
    expect(schema.name.title).toBe("Имя пользователя")

    expect(schema.role.type).toBe("enum")
    expect(schema.role.required).toBe(true)
    expect(schema.role.default).toBe("user")
    expect(schema.role.title).toBe("Роль")
    expect(schema.role.values).toEqual(["user", "admin", "moderator"])

    expect(schema.isActive.type).toBe("boolean")
    expect(schema.isActive.required).toBe(true)
    expect(schema.isActive.default).toBe(true)
    expect(schema.isActive.title).toBe("Активен")

    // Проверяем optional поля
    expect(schema.age.type).toBe("number")
    expect(schema.age.required).toBe(false)
    expect(schema.age.default).toBeUndefined()

    expect(schema.description.type).toBe("string")
    expect(schema.description.required).toBe(false)
    expect(schema.description.default).toBeUndefined()
    expect(schema.description.title).toBe("Описание")

    expect(schema.priority.type).toBe("enum")
    expect(schema.priority.required).toBe(false)
    expect(schema.priority.default).toBeUndefined()
    expect(schema.priority.title).toBe("Приоритет")
    expect(schema.priority.values).toEqual(["low", "medium", "high"])

    expect(schema.tags.type).toBe("array")
    expect(schema.tags.required).toBe(false)
    expect(schema.tags.default).toBeUndefined()
    expect(schema.tags.title).toBe("Теги")

    // Проверяем, что схема остается неизменной при изменении заголовков
    ctx.context._title.name = "Новое имя"
    ctx.context._title.role = "Новая роль"

    expect(ctx.schema.name.title).toBe("Имя пользователя")
    expect(ctx.schema.role.title).toBe("Роль")
    expect(ctx.context._title.name).toBe("Новое имя")
    expect(ctx.context._title.role).toBe("Новая роль")
  })
})
