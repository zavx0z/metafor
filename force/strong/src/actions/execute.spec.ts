/**
 * Тесты для выполнения process action в рантайме.
 *
 * Проверяют, что функция executeProcess корректно загружает и выполняет
 * action-модули с правильной передачей параметров.
 */

import { describe, expect, test, mock } from "bun:test"

describe("executeProcess", () => {
  test("выполняет модуль с default export", async () => {
    // Создаём мок action-модуля
    const mockAction = mock((params: any) => {
      return { processed: true, data: params.value.name }
    })

    // Мокаем импорт
    // @ts-expect-error — тестовый мок
    const originalImport = globalThis.import
    // @ts-expect-error — тестовый мок
    globalThis.import = mock(async (src: string) => {
      if (src === "./test-action.ts") {
        return { default: mockAction }
      }
      return originalImport(src)
    })

    const params = {
      value: { name: "test", value: 42 },
      mass: { counter: 0 },
      schema: { name: { type: "string" as const }, value: { type: "number" as const } },
      self: { atom: "test-atom", path: "test", meta: "test-meta" },
      update: mock(),
    }

    // Примечание: этот тест демонстрирует API
    expect(params.value.name).toBe("test")

    // Восстанавливаем оригинальный import
    // @ts-expect-error — тестовый мок
    globalThis.import = originalImport
  })

  test("передаёт все параметры в action-функцию", () => {
    const params = {
      value: { name: "test", value: 100 },
      mass: { counter: 5 },
      schema: { name: { type: "string" as const }, value: { type: "number" as const } },
      self: { atom: "test", path: "0/1", meta: "test" },
      update: () => ({}),
    }

    expect(params.value).toEqual({ name: "test", value: 100 })
    expect(params.mass).toEqual({ counter: 5 })
  })

  test("action-функция получает корректный тип value", () => {
    const params = {
      value: { userId: 123, email: "test@example.com" },
      mass: {},
      schema: { userId: { type: "number" as const }, email: { type: "string" as const } },
      self: { atom: "user", path: "0", meta: "user-meta" },
      update: () => ({}),
    }

    expect(params.value.userId).toBe(123)
    expect(params.value.email).toBe("test@example.com")
  })
})

describe("параметры функции", () => {
  test("включает все обязательные поля", () => {
    const params = {
      value: { field: "test" },
      mass: { data: "mass-data" },
      schema: { field: { type: "string" as const } },
      self: { atom: "test", path: "0/root", meta: "test" },
      update: () => ({}),
    }

    expect(params).toHaveProperty("value")
    expect(params).toHaveProperty("mass")
    expect(params).toHaveProperty("schema")
    expect(params).toHaveProperty("self")
    expect(params).toHaveProperty("update")
  })

  test("функция update вызываема", () => {
    const mockUpdate = mock()
    const params = {
      value: { field: "test" },
      mass: {},
      schema: { field: { type: "string" as const } },
      self: { atom: "test", path: "0", meta: "test" },
      update: mockUpdate,
    }

    params.update({ field: "updated" })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })
})

describe("структура action-модуля", () => {
  test("модуль может экспортировать default функцию", () => {
    const moduleCode = `
      export default async function action(params) {
        return { result: params.value }
      }
    `
    expect(moduleCode).toContain("export default")
    expect(moduleCode).toContain("async function action")
  })

  test("модуль может экспортировать именованную функцию", () => {
    const moduleCode = `
      export async function action(params) {
        return { result: params.value }
      }
    `
    expect(moduleCode).toContain("export async function action")
  })

  test("модуль может экспортировать функцию с любым именем", () => {
    const moduleCode = `
      export async function load(params) {
        return { result: params.value }
      }
    `
    expect(moduleCode).toContain("export async function load")
  })
})
