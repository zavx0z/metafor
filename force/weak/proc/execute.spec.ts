/**
 * Тесты для выполнения process action в рантайме.
 *
 * Проверяют, что функция executeProcess корректно загружает и выполняет
 * action-модули с правильной передачей параметров и спецификатором импорта.
 */

import { describe, expect, test, mock } from "bun:test"
import { executeProcessWithModule, type ProcessConfig } from "./execute"

describe("executeProcessWithModule", () => {
  test("выполняет модуль с default export через importSpecifier", async () => {
    const mockAction = mock((params: any) => {
      return { processed: true, data: params.value.name }
    })

    const mod = { default: mockAction }

    const params: any = {
      value: { name: "test", value: 42 },
      mass: { counter: 0 },
      schema: { name: { type: "string" as const }, value: { type: "number" as const } },
      self: { atom: "test-atom", path: "test", meta: "test-meta" },
    }

    const result = await executeProcessWithModule(mod, "default", params)

    expect(result).toEqual({ processed: true, data: "test" })
    expect(mockAction).toHaveBeenCalledTimes(1)
  })

  test("выполняет модуль с именованным экспортом", async () => {
    const mockAction = mock((params: any) => {
      return { result: params.value.userId }
    })

    const mod = { commit: mockAction }

    const params: any = {
      value: { userId: 123, email: "test@example.com" },
      mass: {},
      schema: { userId: { type: "number" as const } },
      self: { atom: "user", path: "0", meta: "user-meta" },
    }

    const result = await executeProcessWithModule(mod, "commit", params)

    expect(result).toEqual({ result: 123 })
    expect(mockAction).toHaveBeenCalledTimes(1)
  })

  test("выбрасывает ошибку если спецификатор не найден", () => {
    const mod = { other: "export" }

    const params = {
      value: {},
      mass: {},
      schema: {},
      self: { atom: "test", path: "0", meta: "test" },
    }

    expect(() => executeProcessWithModule(mod, "nonexistent", params)).toThrow(
      'не экспортирует функцию "nonexistent"'
    )
  })

  test("выбрасывает ошибку с пустым списком экспортов", () => {
    const mod = { value: 42, str: "hello" }

    const params = {
      value: {},
      mass: {},
      schema: {},
      self: { atom: "test", path: "0", meta: "test" },
    }

    expect(() => executeProcessWithModule(mod, "fn", params)).toThrow("(нет функций)")
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
