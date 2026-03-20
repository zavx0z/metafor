import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"

import { Axion, Fuzzy, Wimp } from "@dark/part"
import { initializeMatterRoot, matterGenerator } from "./dark.ts"
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
    await hub.teardown()
  })

  const wimps: Wimp[] = []

  describe("zavx0z/git", () => {
    let ast: MetaAST
    let rootFuzzy: Fuzzy
    let rootAxion: Axion
    test("загрузка", async () => {
      // Сначала фиксируем входную meta как эталон для последующего явного pipeline-прохода.
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
      // Root Wimp регистрируется отдельно до запуска генератора, чтобы тест повторял реальный dark-проход.
      initializeMatterRoot(wimp, ast)

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
    let generator: ReturnType<typeof matterGenerator>
    test("создание генератора", () => {
      // Генератор здесь и есть явная форма one-meta pipeline на уровне dark.
      generator = matterGenerator(wimp, ast)

      expect(generator, "generator должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator должен иметь метод next").toBe("function")
      expect(generator[Symbol.iterator], "generator должен быть итерируемым").toBeDefined()
    })
    test("обработка первого уровня", () => {
      // Первый слой materialize служебные частицы текущей meta, но ещё не continuation Wimp.
      const firstLevel = generator.next()
      if (firstLevel.done) throw new Error("first level is done")

      const firstLayer = firstLevel.value

      expect(firstLevel.done, "первый слой не должен завершать generator").toBe(false)
      expect(firstLayer, "первый цикл должен materialize Fuzzy и Axion текущей meta").toHaveLength(2)

      rootFuzzy = firstLayer.find((particle): particle is Fuzzy => particle instanceof Fuzzy)!
      rootAxion = firstLayer.find((particle): particle is Axion => particle instanceof Axion)!

      expect(rootFuzzy, "на первом уровне должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(rootAxion, "на первом уровне должен появиться Axion").toBeInstanceOf(Axion)

      for (const particle of firstLayer) {
        expect(dark$.parent.get(particle), "на первом уровне каждая materialized частица должна быть привязана к root Wimp").toBe(
          wimp,
        )

        expect(
          dark$.particles.get(particle.id),
          "после записи каждая частица первого уровня должна попасть в dark$.particles",
        ).toBe(particle)
      }

      const materialized = Array.from(dark$.particles.values())

      expect(dark$.particles.size, "после первого уровня в dark$ должны быть root Wimp, Fuzzy и Axion").toBe(3)
      expect(dark$.particles.get(wimp.id), "dark$ должен хранить root Wimp по id").toBe(wimp)
      expect(materialized.includes(rootFuzzy), "Fuzzy первого уровня должен быть сохранён в dark$").toBe(true)
      expect(materialized.includes(rootAxion), "Axion первого уровня должен быть сохранён в dark$").toBe(true)
      expect(rootFuzzy.value, "Fuzzy без выбранного enum значения должен быть пустым").toBeNull()
      expect((rootAxion as any)?.basis, "Axion runtime contract не должен хранить basis").toBeUndefined()
      expect((rootAxion as any)?.expr, "Axion runtime contract не должен хранить expr").toBeUndefined()
      expect(wimp.children, "root Wimp должен получить связи на Fuzzy и Axion первого уровня").toEqual(
        new Set([rootFuzzy.id, rootAxion.id]),
      )
      expect(rootFuzzy.children, "на первом уровне Fuzzy ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(rootAxion.children, "на первом уровне Axion ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(dark$.meta, "meta lookup после первого уровня должен содержать только root Wimp").toEqual(
        new Map([[wimp.id, src]]),
      )
      expect(dark$.parent.get(rootFuzzy), "parent Fuzzy первого уровня должен быть root Wimp").toBe(wimp)
      expect(dark$.parent.get(rootAxion), "parent Axion первого уровня должен быть root Wimp").toBe(wimp)
      expect(wimps, "на первом уровне не должно появляться новых Wimp continuation").toEqual([])
    })
    test("обработка второго уровня", () => {
      // Второй слой раскрывает continuation из Fuzzy и child-ветку из логического узла.
      const secondLevel = generator.next()
      const values = ref.fields.operation?.values ?? []
      if (secondLevel.done) throw new Error("second level is done")

      const secondLayer = secondLevel.value

      expect(secondLevel.done, "второй слой не должен завершать generator").toBe(false)
      expect(secondLayer, "второй слой должен materialize только continuation Wimp текущего шага").toHaveLength(
        values.length + 1,
      )

      for (const particle of secondLayer) {
        expect(particle, "на втором уровне каждая запись generator должна materialize Wimp").toBeInstanceOf(Wimp)
        wimps.push(particle as Wimp)

        expect(
          dark$.particles.get(particle.id),
          "после записи каждая частица второго уровня должна попасть в dark$.particles",
        ).toBe(particle)
      }

      const branchWimps = secondLayer.filter(
        (particle): particle is Wimp => particle instanceof Wimp && dark$.parent.get(particle) === rootFuzzy,
      )
      const childWimp = secondLayer.find(
        (particle): particle is Wimp => particle instanceof Wimp && dark$.parent.get(particle) === rootAxion,
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
        "дочерний Wimp должен получать вычисленные child values из node.fields через strong",
      ).toEqual({ message: null })
      expect(rootFuzzy.children, "Fuzzy должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchWimps.map((particle) => particle.id)),
      )
      expect(rootAxion.children, "Axion должен содержать связь на дочерний Wimp").toEqual(new Set([childWimp!.id]))
      expect(dark$.meta, "meta lookup после второго уровня должен содержать root и все materialized Wimp").toEqual(
        new Map([[wimp.id, src], ...wimps.map((particle) => [particle.id, particle.src] as const)]),
      )
      for (const particle of branchWimps) {
        expect(dark$.parent.get(particle), "parent каждой enum Wimp-ветви должен быть Fuzzy").toBe(rootFuzzy)
      }
      expect(dark$.parent.get(childWimp!), "parent дочернего Wimp должен быть Axion").toBe(rootAxion)
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
    let generator: ReturnType<typeof matterGenerator>
    let childFuzzy: Fuzzy
    const childWimps: Wimp[] = []

    test("создание root wimp", () => {
      // Следующая meta берёт уже materialized Wimp из предыдущего dark-прохода.
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
      // Для дочерней meta форма остаётся такой же: dark снова управляет layer-by-layer обходом.
      generator = matterGenerator(wimp, ast)

      expect(generator, "generator для git-start должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator для git-start должен иметь метод next").toBe("function")
    })
    test("обработка первого уровня", () => {
      // На первом шаге дочерней meta появляется только Fuzzy-контейнер для будущих ветвей.
      const firstLevel = generator.next()
      if (firstLevel.done) throw new Error("first git-start level is done")

      const firstLayer = firstLevel.value

      expect(firstLevel.done, "первый слой git-start не должен завершать generator").toBe(false)
      expect(firstLayer, "первый цикл git-start должен materialize только Fuzzy").toHaveLength(1)

      childFuzzy = firstLayer[0] as Fuzzy

      for (const particle of firstLayer) {
        expect(dark$.parent.get(particle), "на первом уровне git-start parent должен быть root Wimp").toBe(wimp)

        expect(dark$.particles.get(particle.id), "после записи Fuzzy git-start должен попасть в dark$.particles").toBe(
          particle,
        )
      }

      expect(childFuzzy, "после первого уровня git-start в dark$ должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(wimp.children, "git-start Wimp должен получить связь на Fuzzy первого уровня").toContain(childFuzzy.id)
      expect(childFuzzy.children, "на первом уровне git-start Fuzzy ещё не должен иметь дочерних частиц").toEqual(
        new Set(),
      )
      expect(childWimps, "на первом уровне git-start новых Wimp continuation не должно появляться").toEqual([])
    })
    test("обработка второго уровня", () => {
      // На втором шаге дочерняя meta раскрывает Wimp-ветви из enum continuation.
      const secondLevel = generator.next()
      if (secondLevel.done) throw new Error("second git-start level is done")

      const secondLayer = secondLevel.value

      expect(secondLevel.done, "второй слой git-start не должен завершать generator").toBe(false)
      expect(secondLayer, "второй цикл git-start должен materialize только continuation Wimp").toHaveLength(
        ast.fields.operation?.values?.length ?? 0,
      )

      for (const particle of secondLayer) {
        expect(particle, "на втором уровне git-start каждая запись generator должна materialize Wimp").toBeInstanceOf(Wimp)
        childWimps.push(particle as Wimp)

        expect(dark$.particles.get(particle.id), "после записи Wimp git-start должен попасть в dark$.particles").toBe(
          particle,
        )
        expect(dark$.parent.get(particle), "после записи parent Wimp git-start должен быть сохранён").toBe(childFuzzy)
      }

      const values = ast.fields.operation?.values ?? []
      const branchWimps = secondLayer.filter(
        (particle): particle is Wimp => particle instanceof Wimp && dark$.parent.get(particle) === childFuzzy,
      )

      expect(
        branchWimps.map((particle) => particle.src),
        "после второго уровня git-start Fuzzy должен раскрыть все static Wimp из enum values",
      ).toEqual(values.map((value) => `zavx0z/git-start-${value}`))
      expect(
        branchWimps.map((particle) => particle.values),
        "Wimp-ветви git-start должны получить runtime values из node.fields AST через strong",
      ).toEqual(values.map(() => ({ args: null })))
      expect(childFuzzy.children, "Fuzzy git-start должен содержать связи на все materialized Wimp-ветви").toEqual(
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
