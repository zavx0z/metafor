/**
 * Тесты для функции loadAction.
 *
 * Проверяют, что функция loadAction корректно загружает и извлекает
 * action-модули с правильной обработкой спецификатора импорта.
 */

import { describe, expect, test } from "bun:test"
import { loadAction } from "./load"
import type { ActionFn } from "@metafor/types/bulk"

const fixturesPath = import.meta.dir + "/fixtures"

describe("loadAction", () => {
  test("загружает модуль с default export без importSpecifier", async () => {
    const actionFn = await loadAction(`${fixturesPath}/default-export.ts`)

    expect(typeof actionFn).toBe("function")

    const result = (actionFn as ActionFn<any, any, any>)({
      self: { atom: "test", path: "0", meta: "test" },
      field: { name: { type: "string" } },
      value: { name: "test" },
      mass: {},
    })
    expect(result).toEqual({ processed: true, data: "test", field: true })
  })

  test("загружает модуль с явным importSpecifier", async () => {
    const actionFn = await loadAction({
      src: `${fixturesPath}/named-export.ts`,
      importSpecifier: "commit",
    })

    const result = (actionFn as ActionFn<any, any, any>)({
      self: { atom: "test", path: "0", meta: "test" },
      field: { count: { type: "number" } },
      value: { count: 42 },
      mass: {},
    })
    expect(result).toEqual({ committed: 42, field: true })
  })

  test("загружает модуль со строкой-путем", async () => {
    const actionFn = await loadAction(`${fixturesPath}/default-export.ts`)

    const result = (actionFn as ActionFn<any, any, any>)({
      self: { atom: "test", path: "0", meta: "test" },
      field: { name: { type: "string" } },
      value: { name: "hello" },
      mass: {},
    })
    expect(result).toEqual({ processed: true, data: "hello", field: true })
  })

  test("выбрасывает ошибку если спецификатор не найден", async () => {
    await expect(
      loadAction({
        src: `${fixturesPath}/different-name.ts`,
        importSpecifier: "nonexistent",
      }),
    ).rejects.toThrow('не экспортирует функцию "nonexistent"')
  })

  test("выбрасывает ошибку если нет default экспорта", async () => {
    await expect(loadAction(`${fixturesPath}/no-functions.ts`)).rejects.toThrow(
      "не экспортирует валидную функцию действия",
    )
  })

  test("выбрасывает ошибку с пустым списком экспортов", async () => {
    await expect(
      loadAction({
        src: `${fixturesPath}/no-functions.ts`,
        importSpecifier: "fn",
      }),
    ).rejects.toThrow("(нет функций)")
  })
})
