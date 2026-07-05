/**
 * Тесты для функции executeProcess.
 *
 * Проверяют, что функция корректно выполняет действия
 * с обработкой синхронных/асинхронных результатов и ошибок.
 */

import { describe, expect, test, mock } from "bun:test"
import { executeProcess } from "./execute"
import type { ExecuteParams } from "@metafor/types/bulk/weak"

describe("executeProcess", () => {
  test("выполняет синхронное действие", async () => {
    const mockAction = mock((params: any) => {
      return { processed: true, data: params.value.name }
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "test-atom", path: "test", meta: "test-meta" },
      field: { name: { type: "string" }, value: { type: "number" } },
      value: { name: "test", value: 42 },
      mass: { counter: 0 },
    }

    const result = await executeProcess(params)

    expect(result).toEqual({ processed: true, data: "test" })
    expect(mockAction).toHaveBeenCalledTimes(1)
  })

  test("выполняет асинхронное действие", async () => {
    const mockAction = mock(async (params: any) => {
      return { async: true, userId: params.value.userId }
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "user", path: "0", meta: "user-meta" },
      field: { userId: { type: "number" } },
      value: { userId: 123 },
      mass: {},
    }

    const result = await executeProcess(params)

    expect(result).toEqual({ async: true, userId: 123 })
    expect(mockAction).toHaveBeenCalledTimes(1)
  })

  test("выбрасывает ошибку если действие не задано", async () => {
    const params: ExecuteParams = {
      action: undefined as any,
      self: { atom: "test", path: "0", meta: "test" },
      field: {},
      value: {},
      mass: {},
    }

    await expect(executeProcess(params)).rejects.toThrow("Нечего делать!")
  })

  test("нормализует ошибку из строки", async () => {
    const mockAction = mock(() => {
      throw "Ошибка выполнения"
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "test", path: "0", meta: "test" },
      field: {},
      value: {},
      mass: {},
    }

    await expect(executeProcess(params)).rejects.toThrow("Ошибка выполнения")
  })

  test("нормализует ошибку из объекта", async () => {
    const mockAction = mock(() => {
      throw { code: 500, message: "Internal error" }
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "test", path: "0", meta: "test" },
      field: {},
      value: {},
      mass: {},
    }

    await expect(executeProcess(params)).rejects.toThrow()
  })

  test("нормализует ошибку из Error", async () => {
    const mockAction = mock(() => {
      throw new Error("Явная ошибка")
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "test", path: "0", meta: "test" },
      field: {},
      value: {},
      mass: {},
    }

    await expect(executeProcess(params)).rejects.toThrow("Явная ошибка")
  })

  test("обрабатывает отклонение Promise", async () => {
    const mockAction = mock(async () => {
      throw new Error("Асинхронная ошибка")
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "test", path: "0", meta: "test" },
      field: {},
      value: {},
      mass: {},
    }

    await expect(executeProcess(params)).rejects.toThrow("Асинхронная ошибка")
  })

  test("передаёт все параметры в действие", async () => {
    const mockAction = mock((params: any) => {
      return {
        hasSelf: !!params.self,
        hasField: !!params.field,
        hasValue: !!params.value,
        hasMass: !!params.mass,
      }
    })

    const params: ExecuteParams = {
      action: mockAction,
      self: { atom: "test", path: "0", meta: "test" },
      field: { count: { type: "number" } },
      value: { count: 42 },
      mass: { counter: 1 },
    }

    const result = await executeProcess(params)

    expect(result).toEqual({ hasSelf: true, hasField: true, hasValue: true, hasMass: true })
    expect(mockAction).toHaveBeenCalledWith({
      self: { atom: "test", path: "0", meta: "test" },
      field: { count: { type: "number" } },
      value: { count: 42 },
      mass: { counter: 1 },
    })
  })
})
