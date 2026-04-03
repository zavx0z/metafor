import { describe, expect, test } from "bun:test"
import { Axion } from "@dark/strong"

/**
 * Структура тестов для частицы Axion.
 *
 * Axion — это логическая группировка.
 * Он не должен подменять собой ни Wimp, ни Fuzzy, ни Macho.
 */

describe("Axion — логическая группировка", () => {
  test("по умолчанию стартует как пустая частица группировки", () => {
    const particle = new Axion()

    expect(particle.children, "Axion по умолчанию должен иметь пустой набор дочерних частиц").toEqual(new Set())
    expect(particle.parent, "Axion по умолчанию должен иметь явный `null` в `parent`").toBeNull()
    expect((particle as any).basis, "Axion не должен хранить шаблонный `basis`").toBeUndefined()
    expect((particle as any).expr, "Axion не должен хранить шаблонный `expr`").toBeUndefined()
    expect((particle as any).src, "Axion не должен создавать собственный `src`").toBeUndefined()
  })

  // должен группировать дочерние частицы без создания новой мета-ссылки
  // должен сохранять вложенность частиц
})

describe("Axion — ограничения роли", () => {
  // не должен подменять собой Wimp
  // не должен подменять собой Fuzzy
  // не должен подменять собой Macho
})

describe("Axion — нормализация", () => {
  // должен сохранять связь группировки
  // не должен хранить шаблонные basis/expr в рабочем экземпляре
  // не должен создавать собственный src
})
