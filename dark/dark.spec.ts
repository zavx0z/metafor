import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"

import { Axion, Fuzzy, Wimp } from "@dark/part"
import { bindParticles, resolveFieldValues, strong$ } from "@dark/strong"
import { particleGenerator } from "@dark/gravity"
import { loadMetaAST } from "./load.ts"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")

const src = "zavx0z/git"
const startSrc = "zavx0z/git-start"
const ref = reference as MetaAST

describe("zavx0z/git", () => {
  beforeAll(async () => await hub.setup())
  afterAll(async () => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()
    strong$.reset()
    await hub.teardown()
  })

  const wimps: Wimp[] = []

  describe("zavx0z/git", () => {
    let ast: MetaAST
    test("загрузка", async () => {
      ast = (await loadMetaAST("zavx0z/git" as SRC)) as MetaAST
      expect(ast, "loadMetaAST должен вернуть тот же MetaAST, что и ref").toEqual(ref)
      expect(Object.keys(ast).sort(), "MetaAST должен содержать ожидаемые корневые ключи").toEqual([
        "fields",
        "mass",
        "matter",
        "name",
        "processes",
        "superposition",
      ])
      expect(ast.name, "имя меты должно совпадать с именем из ref").toBe("git")
      expect(ast.fields, "fields должны совпадать с fixture").toEqual({
        operation: {
          type: "enum<string>",
          label: "Тип операции",
          values: [
            "start",
            "work",
            "examine",
            "history",
            "collaborate",
            "worktree",
            "stash",
            "submodule",
            "config",
            "plumbing",
          ],
        },
        error: {
          type: "string",
          label: "Ошибка",
        },
        command: {
          type: "string",
          label: "Команда",
        },
        args: {
          type: "string",
          label: "Аргументы",
        },
      })
      expect(ast.superposition, "superposition должен совпадать с fixture").toEqual({
        "получение команды": {
          "определение операции": {
            command: {
              null: false,
            },
          },
        },
        "определение операции": {
          выполнение: {
            operation: {
              null: false,
            },
          },
          ошибка: {
            error: {
              null: false,
            },
          },
        },
        выполнение: {
          "получение команды": {
            operation: null,
          },
        },
        ошибка: {
          "получение команды": {
            error: null,
          },
        },
      })
      expect(ast.processes, "processes должны совпадать с fixture").toEqual({
        "определение операции": {
          type: "action",
          action: {
            read: ["command"],
          },
          success: {
            src: '({ update, data }) => update(data, "s")',
          },
          error: {
            src: '({ update, error }) => update({ error: error.message }, "e")',
            write: ["error"],
          },
        },
      })
      expect(ast.mass, "mass должен быть пустым объектом").toEqual({})
      expect(ast.matter, "matter должен совпадать с fixture").toEqual([
        {
          src: {
            data: "/value/operation",
            expr: "zavx0z/git-${_[0]}",
          },
          tag: "meta-for",
          type: "meta",
          fields: {
            data: ["/value/operation", "/value/args"],
            expr: "{ operation: _[0], args: _[1] }",
          },
        },
        {
          type: "log",
          data: "/state",
          expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
          child: [
            {
              src: "zavx0z/git-error",
              tag: "meta-for",
              type: "meta",
              fields: {
                data: "/value/error",
                expr: "{ message: _[0] }",
              },
            },
          ],
        },
      ])
    })
    let wimp: Wimp
    test("создание wimp", () => {
      wimp = new Wimp(src)
      wimp.values = resolveFieldValues(ast.fields)

      dark$.particles.set(wimp.id, wimp)
      dark$.meta.set(wimp.id, wimp.src)

      expect(dark$.particles, "корневой wimp должен быть сохранён в dark$.particles").toEqual(
        new Map([[wimp.id, wimp]]),
      )
      expect(dark$.meta, "meta lookup должен сохранить src корневого wimp").toEqual(new Map([[wimp.id, src]]))
      expect(wimp.values, "корневой wimp должен получить runtime values из ast.fields").toEqual({
        operation: null,
        error: null,
        command: null,
        args: null,
      })
      expect(dark$.parent, "parent store должен оставаться WeakMap").toBeInstanceOf(WeakMap)
    })
    test("присваивание массы wimp", () => {
      const massWimp = new Wimp(src)

      if (ref.mass && Object.keys(ref.mass).length > 0) {
        massWimp.mass = ref.mass
        expect(massWimp.mass, "mass должен присваиваться wimp из ref.mass").toEqual(ref.mass)
        return
      }

      expect(massWimp.mass, "mass не должен присваиваться при пустом ref.mass").toBeUndefined()
    })
    let generator: ReturnType<typeof particleGenerator>
    test("создание генератора", () => {
      if (!ast.matter) throw new Error("matter is undefined")

      generator = particleGenerator(wimp, ast.matter, ast.fields)
      strong$.reset()

      expect(generator, "generator должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator должен иметь метод next").toBe("function")
      expect(generator[Symbol.iterator], "generator должен быть итерируемым").toBeDefined()
    })
    test("обработка первого уровня", () => {
      const firstLevel = generator.next()
      const dynamicMeta = ref.matter?.[0]
      const logicalMeta = ref.matter?.[1]
      if (!dynamicMeta || dynamicMeta.type !== "meta") throw new Error("dynamic meta node is undefined")
      if (!logicalMeta || logicalMeta.type !== "log") throw new Error("logical meta node is undefined")

      expect(firstLevel.done, "первый слой не должен завершать generator").toBe(false)
      expect(firstLevel.value, "первый цикл должен вернуть metadata Fuzzy и Axion с root Wimp как parent").toEqual([
        { kind: "fuzzy", node: dynamicMeta, parent: wimp, meta: {} },
        {
          kind: "axion",
          node: logicalMeta,
          parent: wimp,
          meta: {},
        },
      ])

      for (const { particle, parent, seed } of bindParticles(firstLevel.value, ast.fields)) {
        expect(parent, "на первом уровне каждый materialized parent должен быть root Wimp").toBe(wimp)
        expect(seed.kind, "на первом уровне должны materialize только Fuzzy и Axion").toMatch(/^(fuzzy|axion)$/)

        parent.children.add(particle.id)
        if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)
        if (particle instanceof Wimp) {
          wimps.push(particle)
          dark$.meta.set(particle.id, particle.src)
        }
        dark$.particles.set(particle.id, particle)
        dark$.parent.set(particle, parent)

        expect(
          dark$.particles.get(particle.id),
          "после записи каждая частица первого уровня должна попасть в dark$.particles",
        ).toBe(particle)
        expect(
          dark$.parent.get(particle),
          "после записи parent частицы первого уровня должен быть сохранён в dark$.parent",
        ).toBe(parent)
      }

      const materialized = Array.from(dark$.particles.values())
      const fuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && dark$.parent.get(particle) === wimp,
      )
      const axion = materialized.find(
        (particle): particle is Axion => particle instanceof Axion && dark$.parent.get(particle) === wimp,
      )

      expect(dark$.particles.size, "после первого уровня в dark$ должны быть root Wimp, Fuzzy и Axion").toBe(3)
      expect(dark$.particles.get(wimp.id), "dark$ должен хранить root Wimp по id").toBe(wimp)
      expect(fuzzy, "после первого уровня в dark$ должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(axion, "после первого уровня в dark$ должен появиться Axion").toBeInstanceOf(Axion)
      expect(fuzzy?.value, "Fuzzy без выбранного enum значения должен быть пустым").toBeNull()
      expect((axion as any)?.basis, "Axion runtime contract не должен хранить basis").toBeUndefined()
      expect((axion as any)?.expr, "Axion runtime contract не должен хранить expr").toBeUndefined()
      expect(wimp.children, "root Wimp должен получить связи на Fuzzy и Axion первого уровня").toEqual(
        new Set([fuzzy!.id, axion!.id]),
      )
      expect(fuzzy?.children, "на первом уровне Fuzzy ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(axion?.children, "на первом уровне Axion ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(dark$.meta, "meta lookup после первого уровня должен содержать только root Wimp").toEqual(
        new Map([[wimp.id, src]]),
      )
      expect(dark$.parent.get(fuzzy!), "parent Fuzzy первого уровня должен быть root Wimp").toBe(wimp)
      expect(dark$.parent.get(axion!), "parent Axion первого уровня должен быть root Wimp").toBe(wimp)
      expect(wimps, "на первом уровне не должно появляться новых Wimp continuation").toEqual([])
    })
    test("обработка второго уровня", () => {
      const secondLevel = generator.next()
      const values = ref.fields.operation?.values ?? []
      const dynamicMeta = ref.matter?.[0]
      const logicalMeta = ref.matter?.[1]
      const childMeta = logicalMeta?.type === "log" ? logicalMeta.child?.[0] : undefined
      if (!dynamicMeta || dynamicMeta.type !== "meta") throw new Error("dynamic meta node is undefined")
      if (!childMeta || childMeta.type !== "meta") throw new Error("child meta node is undefined")

      expect(secondLevel.done, "второй слой не должен завершать generator").toBe(false)
      expect(
        secondLevel.value,
        "второй слой должен раскрывать все static Wimp из Fuzzy и дочернюю ветку Axion",
      ).toEqual([
        ...values.map((value) =>
          expect.objectContaining({
            kind: "wimp",
            src: `zavx0z/git-${value}`,
            node: dynamicMeta,
            meta: {},
          }),
        ),
        expect.objectContaining({
          kind: "wimp",
          src: "zavx0z/git-error",
          node: childMeta,
          meta: {},
        }),
      ])

      for (const { particle, parent, seed } of bindParticles(secondLevel.value, ast.fields)) {
        expect(particle, "на втором уровне каждая запись bindParticles должна materialize частицу").toBeInstanceOf(Wimp)
        expect(seed.kind, "на втором уровне generator должен materialize только Wimp continuation").toBe("wimp")
        expect(
          parent instanceof Fuzzy || parent instanceof Axion,
          "на втором уровне parent каждой частицы должен быть либо Fuzzy, либо Axion",
        ).toBe(true)

        parent.children.add(particle.id)
        if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)
        if (particle instanceof Wimp) {
          wimps.push(particle)
          dark$.meta.set(particle.id, particle.src)
        }
        dark$.particles.set(particle.id, particle)
        dark$.parent.set(particle, parent)

        expect(
          dark$.particles.get(particle.id),
          "после записи каждая частица второго уровня должна попасть в dark$.particles",
        ).toBe(particle)
        expect(
          dark$.parent.get(particle),
          "после записи parent частицы второго уровня должен быть сохранён в dark$.parent",
        ).toBe(parent)
      }

      const materialized = Array.from(dark$.particles.values())
      const fuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && dark$.parent.get(particle) === wimp,
      )
      const axion = materialized.find(
        (particle): particle is Axion => particle instanceof Axion && dark$.parent.get(particle) === wimp,
      )
      const branchWimps = materialized.filter(
        (particle): particle is Wimp => particle instanceof Wimp && dark$.parent.get(particle) === fuzzy,
      )
      const childWimp = materialized.find(
        (particle): particle is Wimp => particle instanceof Wimp && dark$.parent.get(particle) === axion,
      )

      expect(dark$.particles.size, "после второго уровня в dark$ должны быть root, Fuzzy, Axion и все Wimp ветви").toBe(
        values.length + 4,
      )
      expect(
        branchWimps.map((particle) => particle.src),
        "после второго уровня Fuzzy должен раскрыть все static Wimp из enum values",
      ).toEqual(values.map((value) => `zavx0z/git-${value}`))
      expect(
        branchWimps.map((particle) => particle.values),
        "Wimp-ветви Fuzzy должны получить runtime values из node.fields AST через strong",
      ).toEqual(values.map(() => ({ operation: null, args: null })))
      expect(childWimp, "после второго уровня Axion должен получить дочерний Wimp в dark$").toBeDefined()
      expect(childWimp?.src, "дочерний Wimp должен сохранять статический src из child meta").toBe("zavx0z/git-error")
      expect(
        childWimp?.values,
        "дочерний Wimp должен получать вычисленные child values из seed.node через strong",
      ).toEqual({ message: null })
      expect(fuzzy?.children, "Fuzzy должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchWimps.map((particle) => particle.id)),
      )
      expect(axion?.children, "Axion должен содержать связь на дочерний Wimp").toEqual(new Set([childWimp!.id]))
      expect(dark$.meta, "meta lookup после второго уровня должен содержать root и все materialized Wimp").toEqual(
        new Map([[wimp.id, src], ...wimps.map((particle) => [particle.id, particle.src] as const)]),
      )
      for (const particle of branchWimps) {
        expect(dark$.parent.get(particle), "parent каждой enum Wimp-ветви должен быть Fuzzy").toBe(fuzzy)
      }
      expect(dark$.parent.get(childWimp!), "parent дочернего Wimp должен быть Axion").toBe(axion)
      expect(
        wimps.map((particle) => particle.src),
        "список continuation Wimp должен повторять materialized Wimp второго уровня",
      ).toEqual([...values.map((value) => `zavx0z/git-${value}`), "zavx0z/git-error"])
    })
    test("завершение генератора", () => {
      const end = generator.next()
      expect(end.done, "generator должен завершиться после второго уровня").toBe(true)
      expect(end.value, "после завершения generator не должен возвращать следующий слой").toBeUndefined()
    })
  })

  describe("zavx0z/git-start", () => {
    let ast: MetaAST
    let wimp: Wimp
    let generator: ReturnType<typeof particleGenerator>
    const childWimps: Wimp[] = []

    test("создание root wimp", () => {
      wimp = wimps[0]!

      expect(wimp, "первый continuation Wimp из root meta должен существовать").toBeDefined()
      expect(wimp.src, "первый continuation Wimp должен быть git-start").toBe(startSrc)
      expect(wimp.values, "git-start Wimp должен сохранить values, вычисленные на предыдущем meta-уровне").toEqual({
        operation: null,
        args: null,
      })
    })
    test("загрузка", async () => {
      ast = (await loadMetaAST(startSrc as SRC)) as MetaAST

      expect(ast.name, "имя дочерней меты должно быть git-start").toBe("git-start")
      expect(ast.fields, "fields дочерней меты должны быть загружены").toEqual({
        operation: {
          type: "enum<string>",
          label: "Тип операции",
          values: ["clone", "init"],
        },
        args: {
          type: "string",
          label: "Аргументы",
        },
      })
    })
    test("создание генератора", () => {
      if (!ast.matter) throw new Error("matter is undefined")

      generator = particleGenerator(wimp, ast.matter, ast.fields)
      strong$.reset()

      expect(generator, "generator для git-start должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator для git-start должен иметь метод next").toBe("function")
    })
    test("обработка первого уровня", () => {
      const firstLevel = generator.next()
      const dynamicMeta = ast.matter?.[0]
      if (!dynamicMeta || dynamicMeta.type !== "meta") throw new Error("dynamic meta node is undefined")

      expect(firstLevel.done, "первый слой git-start не должен завершать generator").toBe(false)
      expect(firstLevel.value, "первый цикл git-start должен вернуть Fuzzy с root Wimp как parent").toEqual([
        {
          kind: "fuzzy",
          node: dynamicMeta,
          parent: wimp,
          meta: {},
        },
      ])

      for (const { particle, parent, seed } of bindParticles(firstLevel.value, ast.fields)) {
        expect(parent, "на первом уровне git-start parent должен быть root Wimp").toBe(wimp)
        expect(seed.kind, "на первом уровне git-start должен materialize только Fuzzy").toBe("fuzzy")

        parent.children.add(particle.id)
        if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)
        if (particle instanceof Wimp) {
          childWimps.push(particle)
          dark$.meta.set(particle.id, particle.src)
        }
        dark$.particles.set(particle.id, particle)
        dark$.parent.set(particle, parent)

        expect(dark$.particles.get(particle.id), "после записи Fuzzy git-start должен попасть в dark$.particles").toBe(
          particle,
        )
        expect(dark$.parent.get(particle), "после записи parent Fuzzy git-start должен быть сохранён").toBe(parent)
      }

      const materialized = Array.from(dark$.particles.values())
      const fuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && dark$.parent.get(particle) === wimp,
      )

      expect(fuzzy, "после первого уровня git-start в dark$ должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(wimp.children, "git-start Wimp должен получить связь на Fuzzy первого уровня").toContain(fuzzy!.id)
      expect(fuzzy?.children, "на первом уровне git-start Fuzzy ещё не должен иметь дочерних частиц").toEqual(new Set())
      expect(childWimps, "на первом уровне git-start новых Wimp continuation не должно появляться").toEqual([])
    })
    test("обработка второго уровня", () => {
      const secondLevel = generator.next()
      const dynamicMeta = ast.matter?.[0]
      if (!dynamicMeta || dynamicMeta.type !== "meta") throw new Error("dynamic meta node is undefined")

      expect(secondLevel.done, "второй слой git-start не должен завершать generator").toBe(false)
      expect(secondLevel.value, "второй цикл git-start должен раскрыть Wimp continuation из Fuzzy").toEqual([
        ...((ast.fields.operation?.values ?? []).map((value) =>
          expect.objectContaining({
            kind: "wimp",
            src: `zavx0z/git-start-${value}`,
            node: dynamicMeta,
            meta: {},
          }),
        )),
      ])

      for (const { particle, parent, seed } of bindParticles(secondLevel.value, ast.fields)) {
        expect(particle, "на втором уровне git-start каждая запись bindParticles должна materialize Wimp").toBeInstanceOf(
          Wimp,
        )
        expect(seed.kind, "на втором уровне git-start должен materialize только Wimp continuation").toBe("wimp")
        expect(parent, "на втором уровне git-start parent должен быть Fuzzy").toBeInstanceOf(Fuzzy)

        parent.children.add(particle.id)
        if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)
        if (particle instanceof Wimp) {
          childWimps.push(particle)
          dark$.meta.set(particle.id, particle.src)
        }
        dark$.particles.set(particle.id, particle)
        dark$.parent.set(particle, parent)

        expect(dark$.particles.get(particle.id), "после записи Wimp git-start должен попасть в dark$.particles").toBe(
          particle,
        )
        expect(dark$.parent.get(particle), "после записи parent Wimp git-start должен быть сохранён").toBe(parent)
      }

      const values = ast.fields.operation?.values ?? []
      const materialized = Array.from(dark$.particles.values())
      const fuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && dark$.parent.get(particle) === wimp,
      )
      const branchWimps = materialized.filter(
        (particle): particle is Wimp => particle instanceof Wimp && dark$.parent.get(particle) === fuzzy,
      )

      expect(
        branchWimps.map((particle) => particle.src),
        "после второго уровня git-start Fuzzy должен раскрыть все static Wimp из enum values",
      ).toEqual(values.map((value) => `zavx0z/git-start-${value}`))
      expect(
        branchWimps.map((particle) => particle.values),
        "Wimp-ветви git-start должны получить runtime values из node.fields AST через strong",
      ).toEqual(values.map(() => ({ args: null })))
      expect(fuzzy?.children, "Fuzzy git-start должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchWimps.map((particle) => particle.id)),
      )
      expect(
        childWimps.map((particle) => particle.src),
        "список continuation Wimp git-start должен повторять materialized Wimp второго уровня",
      ).toEqual(values.map((value) => `zavx0z/git-start-${value}`))
    })
    test("завершение генератора", () => {
      const end = generator.next()

      expect(end.done, "generator git-start должен завершиться после второго уровня").toBe(true)
      expect(end.value, "после завершения generator git-start не должен возвращать следующий слой").toBeUndefined()
    })
  })
})
