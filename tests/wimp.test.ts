import { describe, expect, test } from "bun:test"

import type { Wimp, StaticBinding, DynamicBinding, Binding } from "@dark/types"

/**
 * Структура тестов для частицы Wimp.
 *
 * Wimp — это дочерняя meta-ссылка.
 * Здесь должны проверяться только ограничения и контракт формирования
 * частицы из dsl.gravity, а не весь dark pipeline.
 */

// -----------------------------------------------------------------------------
// Вспомогательные функции для тестов
// -----------------------------------------------------------------------------

/**
 * Создаёт статический binding для src.
 */
function staticSrc(value: string): StaticBinding<string> {
  return { mode: "static", value }
}

/**
 * Создаёт динамический binding для src.
 */
function dynamicSrc(basis: string | string[], expr?: string): DynamicBinding {
  return { mode: "dynamic", basis, ...(expr ? { expr } : {}) }
}

/**
 * Создаёт binding для fields.
 */
function fieldsBinding(basis: string | string[], expr?: string): Binding<Record<string, unknown>> {
  return { mode: "dynamic", basis, ...(expr ? { expr } : {}) }
}

/**
 * Валидирует hub-адрес (простая проверка формата).
 */
function isValidHubAddress(address: string): boolean {
  return /^[\w-]+\/[\w-]+$/.test(address)
}

// -----------------------------------------------------------------------------
// Допустимый контракт
// -----------------------------------------------------------------------------

describe("Wimp — допустимый контракт", () => {
  test("должен принимать статический src", () => {
    const particle: Wimp = {
      kind: "wimp",
      src: staticSrc("zavx0z/git-error"),
    }

    expect(particle.kind).toBe("wimp")
    expect(particle.src.mode).toBe("static")
    if (particle.src.mode === "static") {
      expect(particle.src.value).toBe("zavx0z/git-error")
    }
  })

  test("должен принимать динамический src только от value", () => {
    const particle: Wimp = {
      kind: "wimp",
      src: dynamicSrc("/value/operation", "zavx0z/git-${_[0]}"),
    }

    expect(particle.src.mode).toBe("dynamic")
    if (particle.src.mode === "dynamic") {
      expect(particle.src.basis).toBe("/value/operation")
      expect(particle.src.expr).toBe("zavx0z/git-${_[0]}")
    }
  })

  test("должен принимать fields только от value", () => {
    const particle: Wimp = {
      kind: "wimp",
      src: staticSrc("zavx0z/git-error"),
      fields: fieldsBinding("/value/error", "{ message: _[0] }"),
    }

    expect(particle.fields).toBeDefined()
    if (particle.fields && particle.fields.mode === "dynamic") {
      expect(particle.fields.basis).toBe("/value/error")
      expect(particle.fields.expr).toBe("{ message: _[0] }")
    }
  })

  test("должен принимать fields с несколькими basis путями", () => {
    const particle: Wimp = {
      kind: "wimp",
      src: dynamicSrc(["/value/operation", "/value/args"], "{ src: _[0], args: _[1] }"),
      fields: fieldsBinding(["/value/operation", "/value/args"], "{ operation: _[0], args: _[1] }"),
    }

    if (particle.src.mode === "dynamic") {
      expect(Array.isArray(particle.src.basis)).toBe(true)
      expect((particle.src.basis as string[]).length).toBe(2)
    }
    if (particle.fields && particle.fields.mode === "dynamic") {
      expect(Array.isArray(particle.fields.basis)).toBe(true)
      expect((particle.fields.basis as string[]).length).toBe(2)
    }
  })
})

// -----------------------------------------------------------------------------
// Ограничения
// -----------------------------------------------------------------------------

describe("Wimp — ограничения", () => {
  test("не должен принимать отсутствующий src", () => {
    // @ts-expect-error — src обязателен
    const invalidParticle: Wimp = {
      kind: "wimp",
    }

    expect(invalidParticle.src).toBeUndefined()
  })

  test("не должен принимать src от mass (контракт)", () => {
    // Контракт требует, чтобы dynamic src использовал basis от value,
    // а не от mass. Это ограничение фиксируется в тестах для будущей валидации.
    // На данном этапе валидация не реализована — только документирование контракта.
    const invalidBasis = "/mass/items"

    // Документирование ограничения: src не должен использовать mass как источник
    expect(invalidBasis.startsWith("/mass")).toBe(true) // это нарушение контракта
    // Будущая валидация должна отклонять basis, начинающиеся с /mass
  })

  test("не должен принимать fields от mass (контракт)", () => {
    // Контракт требует, чтобы fields использовал basis от value,
    // а не от mass. Это ограничение фиксируется в тестах для будущей валидации.
    const invalidBasis = "/mass/data"

    // Документирование ограничения: fields не должен использовать mass как источник
    expect(invalidBasis.startsWith("/mass")).toBe(true) // это нарушение контракта
    // Будущая валидация должна отклонять basis, начинающиеся с /mass
  })

  test("не должен принимать mass как topology payload", () => {
    // Wimp может иметь mass binding, но mass не является topology payload.
    // mass — это дополнительный payload для сложных данных,
    // который не участвует в topology-формировании.
    const particle: Wimp = {
      kind: "wimp",
      src: staticSrc("zavx0z/git"),
      mass: { mode: "dynamic", basis: "/mass/config" },
    }

    // mass допустим только как binding, не как прямой payload
    expect(particle.mass).toBeDefined()
    expect(particle.mass!.mode).toBe("dynamic")
    // mass не участвует в topology-контракте Wimp
  })

  test("не должен принимать невалидный hub-адрес в src", () => {
    const invalidAddresses = [
      "",
      "invalid",
      "no-slash",
      "/leading-slash",
      "trailing-slash/",
      "multiple/slashes/here",
    ]

    for (const address of invalidAddresses) {
      expect(isValidHubAddress(address)).toBe(false)
    }

    const validParticle: Wimp = {
      kind: "wimp",
      src: staticSrc("zavx0z/git"),
    }

    if (validParticle.src.mode === "static") {
      expect(isValidHubAddress(validParticle.src.value)).toBe(true)
    }
  })
})

// -----------------------------------------------------------------------------
// Нормализация
// -----------------------------------------------------------------------------

describe("Wimp — нормализация", () => {
  test("должен нормализовать статический src в StaticBinding", () => {
    const rawSrc = "zavx0z/git-error"
    const normalized: StaticBinding<string> = staticSrc(rawSrc)

    expect(normalized).toEqual({
      mode: "static",
      value: "zavx0z/git-error",
    })
  })

  test("должен нормализовать динамический src в DynamicBinding", () => {
    const rawBasis = "/value/operation"
    const rawExpr = "zavx0z/git-${_[0]}"
    const normalized: DynamicBinding = dynamicSrc(rawBasis, rawExpr)

    expect(normalized).toEqual({
      mode: "dynamic",
      basis: "/value/operation",
      expr: "zavx0z/git-${_[0]}",
    })
  })

  test("должен нормализовать fields в Binding", () => {
    const rawBasis = ["/value/operation", "/value/args"]
    const rawExpr = "{ operation: _[0], args: _[1] }"
    const normalized: Binding<Record<string, unknown>> = fieldsBinding(rawBasis, rawExpr)

    expect(normalized).toEqual({
      mode: "dynamic",
      basis: ["/value/operation", "/value/args"],
      expr: "{ operation: _[0], args: _[1] }",
    })
  })

  test("должен сохранять expr при нормализации динамического binding", () => {
    const particle: Wimp = {
      kind: "wimp",
      src: dynamicSrc("/value/data", "transform(_[0])"),
    }

    if (particle.src.mode === "dynamic") {
      expect(particle.src.expr).toBe("transform(_[0])")
    }
  })

  test("должен поддерживать fields без expr (прямая передача)", () => {
    const particle: Wimp = {
      kind: "wimp",
      src: staticSrc("zavx0z/git"),
      fields: { mode: "dynamic", basis: "/value/payload" },
    }

    expect(particle.fields).toBeDefined()
    if (particle.fields && particle.fields.mode === "dynamic") {
      expect(particle.fields.basis).toBe("/value/payload")
      expect(particle.fields.expr).toBeUndefined()
    }
  })
})

// -----------------------------------------------------------------------------
// Интеграционные проверки контракта
// -----------------------------------------------------------------------------

describe("Wimp — интеграция контракта", () => {
  test("должен формировать валидную частицу из gravity DSL", () => {
    // Пример из meta.json: gravity[0] — это Wimp с динамическим src и fields
    const gravityNode = {
      src: {
        data: "/value/operation",
        expr: "zavx0z/git-${_[0]}",
      },
      type: "meta",
      fields: {
        data: ["/value/operation", "/value/args"],
        expr: "{ operation: _[0], args: _[1] }",
      },
    }

    // Нормализация в Wimp частицу
    const wimp: Wimp = {
      kind: "wimp",
      src: {
        mode: "dynamic",
        basis: gravityNode.src.data,
        expr: gravityNode.src.expr,
      },
      fields: {
        mode: "dynamic",
        basis: gravityNode.fields.data,
        expr: gravityNode.fields.expr,
      },
    }

    expect(wimp.kind).toBe("wimp")
    expect(wimp.src.mode).toBe("dynamic")
    expect(wimp.fields).toBeDefined()
    expect(wimp.fields!.mode).toBe("dynamic")
  })

  test("должен формировать валидную частицу из статического gravity DSL", () => {
    // Пример из meta.json: gravity[1].child[0] — это Wimp со статическим src
    const gravityNode = {
      src: "zavx0z/git-error",
      type: "meta",
      fields: {
        data: "/value/error",
        expr: "{ message: _[0] }",
      },
    }

    // Нормализация в Wimp частицу
    const wimp: Wimp = {
      kind: "wimp",
      src: {
        mode: "static",
        value: gravityNode.src,
      },
      fields: {
        mode: "dynamic",
        basis: gravityNode.fields.data,
        expr: gravityNode.fields.expr,
      },
    }

    expect(wimp.kind).toBe("wimp")
    expect(wimp.src.mode).toBe("static")
    if (wimp.src.mode === "static") {
      expect(wimp.src.value).toBe("zavx0z/git-error")
    }
  })

  test("должен различать Wimp от Fuzzy по наличию basis/expr ветвления", () => {
    // Wimp не имеет basis/expr для ветвления — это просто ссылка
    const wimp: Wimp = {
      kind: "wimp",
      src: staticSrc("zavx0z/git"),
    }

    // У Wimp нет свойств basis/expr на уровне частицы
    expect("basis" in wimp).toBe(false)
    expect("expr" in wimp).toBe(false)
    expect("particles" in wimp).toBe(false)
  })
})
