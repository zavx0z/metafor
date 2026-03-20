import { describe, expect, test } from "bun:test"

import { Macho } from "@dark/part"

/**
 * Структура тестов для частицы Macho.
 *
 * Macho — это множественность.
 * Источник множественности допустим только из value array,
 * причём массив должен содержать только простые типы.
 */

describe("Macho — допустимая множественность", () => {
  // должен принимать map только по value array
  // должен принимать массив строк
  // должен принимать массив чисел
  // должен принимать массив boolean
})

describe("Macho — ограничения источника", () => {
  // не должен принимать map по mass
  // не должен принимать map по state
  // не должен принимать map по не-массиву
})

describe("Macho — ограничения типа элемента", () => {
  // не должен принимать массив объектов
  // не должен принимать деструктуризацию объекта в item
  // не должен принимать обращения вида item.id
})

describe("Macho — нормализация", () => {
  test("не хранит template-shaped payload в runtime instance", () => {
    const particle = new Macho()

    expect((particle as any).basis, "Macho runtime contract не должен хранить template basis").toBeUndefined()
  })

  // должен формировать branch expansion для дочерних частиц
  // не должен смешивать множественность с Wimp/Fuzzy-семантикой
})
