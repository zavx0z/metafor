import { describe, expect, test } from "bun:test"

import { Axion } from "@dark/part"

/**
 * Структура тестов для частицы Axion.
 *
 * Axion — это логическая группировка.
 * Он не должен подменять собой ни Wimp, ни Fuzzy, ни Macho.
 */

describe("Axion — логическая группировка", () => {
  test("по умолчанию стартует как пустая grouping particle", () => {
    const particle = new Axion()

    expect(particle.children, "Axion по умолчанию должен иметь пустой children set").toEqual(new Set())
    expect((particle as any).basis, "Axion runtime contract не должен хранить template basis").toBeUndefined()
    expect((particle as any).expr, "Axion runtime contract не должен хранить template expr").toBeUndefined()
    expect((particle as any).src, "Axion runtime contract не должен создавать собственный src").toBeUndefined()
  })

  // должен группировать дочерние частицы без создания новой meta-ссылки
  // должен сохранять вложенность частиц
})

describe("Axion — ограничения роли", () => {
  // не должен подменять собой Wimp
  // не должен подменять собой Fuzzy
  // не должен подменять собой Macho
})

describe("Axion — нормализация", () => {
  // должен сохранять relation группировки
  // не должен хранить template-shaped basis/expr в runtime instance
  // не должен создавать собственный src
})
