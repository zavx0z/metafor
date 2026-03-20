import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import { HubFixture } from "fixture"
import reference from "../github/zavx0z/git/meta.json"

import type { MatterWimpResult } from "@dark/types/dark"
import { Axion, Fuzzy, Wimp } from "@dark/strong"
import { matterPipeline } from "./dark.ts"
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

  let rootResults: MatterWimpResult[] = []

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

      expect(wimp.values, "до запуска pipeline root Wimp должен оставаться пустым").toBeUndefined()
      expect(wimp.mass, "до запуска pipeline root Wimp не должен иметь mass").toBeUndefined()
      expect(dark$.particles.size, "до первого шага pipeline root Wimp ещё не должен попасть в dark$.particles").toBe(0)
      expect(dark$.meta.size, "до первого шага pipeline meta lookup тоже должен быть пустым").toBe(0)
    })
    let generator: ReturnType<typeof matterPipeline>
    test("создание генератора", () => {
      // Сам pipeline ещё ничего не делает до первого next.
      generator = matterPipeline(wimp, ast)

      expect(generator, "generator должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator должен иметь метод next").toBe("function")
      expect(generator[Symbol.iterator], "generator должен быть итерируемым").toBeDefined()
      expect(wimp.values, "создание generator не должно преждевременно инициализировать root Wimp").toBeUndefined()
    })
    test("обработка первого уровня", () => {
      // Первый next инициализирует root Wimp и проходит первый слой topology.
      // На этом уровне новых Wimp ещё нет, поэтому наружу возвращается пустой слой.
      const firstLevel = generator.next()
      if (firstLevel.done) throw new Error("first level is done")

      const firstLayer = firstLevel.value
      const materialized = Array.from(dark$.particles.values())

      expect(firstLevel.done, "первый слой не должен завершать generator").toBe(false)
      expect(firstLayer, "первый слой должен вернуть пустой список Wimp-результатов").toEqual([])
      expect(wimp.values, "root Wimp должен получить runtime values только на первом next").toEqual({
        operation: null,
        error: null,
        command: null,
        args: null,
      })
      if (ref.mass && Object.keys(ref.mass).length > 0) {
        expect(wimp.mass, "mass должен присваиваться root Wimp при входе в pipeline").toEqual(ref.mass)
      } else {
        expect(wimp.mass, "при пустом ast.mass root Wimp не должен получать mass").toBeUndefined()
      }

      rootFuzzy = materialized.find((particle): particle is Fuzzy => particle instanceof Fuzzy)!
      rootAxion = materialized.find((particle): particle is Axion => particle instanceof Axion)!

      expect(rootFuzzy, "на первом уровне должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(rootAxion, "на первом уровне должен появиться Axion").toBeInstanceOf(Axion)
      expect(dark$.particles.size, "после первого уровня в dark$ должны быть root Wimp, Fuzzy и Axion").toBe(3)
      expect(dark$.particles.get(wimp.id), "dark$ должен хранить root Wimp по id").toBe(wimp)
      expect(dark$.meta, "meta lookup после первого уровня должен содержать только root Wimp").toEqual(
        new Map([[wimp.id, src]]),
      )
      expect(rootFuzzy.value, "Fuzzy без выбранного enum значения должен быть пустым").toBeNull()
      expect((rootAxion as any)?.basis, "Axion runtime contract не должен хранить basis").toBeUndefined()
      expect((rootAxion as any)?.expr, "Axion runtime contract не должен хранить expr").toBeUndefined()
      expect(wimp.children, "root Wimp должен получить связи на Fuzzy и Axion первого уровня").toEqual(
        new Set([rootFuzzy.id, rootAxion.id]),
      )
      expect(rootFuzzy.children, "на первом уровне Fuzzy ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(rootAxion.children, "на первом уровне Axion ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(dark$.parent.get(rootFuzzy), "parent Fuzzy первого уровня должен быть root Wimp").toBe(wimp)
      expect(dark$.parent.get(rootAxion), "parent Axion первого уровня должен быть root Wimp").toBe(wimp)
      expect(rootResults, "до второго слоя ещё не должно быть внешних Wimp-результатов").toEqual([])
    })
    test("обработка второго уровня", () => {
      // Второй слой обнаруживает дочерние Wimp и сразу отдаёт пары [wimp, continuation].
      const secondLevel = generator.next()
      const values = ref.fields.operation?.values ?? []
      if (secondLevel.done) throw new Error("second level is done")

      const secondLayer = secondLevel.value
      const branchResults = secondLayer.filter(([particle]) => dark$.parent.get(particle) === rootFuzzy)
      const childResult = secondLayer.find(([particle]) => dark$.parent.get(particle) === rootAxion)

      rootResults = secondLayer

      expect(secondLevel.done, "второй слой не должен завершать generator").toBe(false)
      expect(secondLayer, "второй слой должен вернуть все Wimp, обнаруженные на этом шаге").toHaveLength(
        values.length + 1,
      )
      expect(dark$.particles.size, "после второго уровня в dark$ должны быть root, Fuzzy, Axion и все Wimp ветви").toBe(
        values.length + 4,
      )
      expect(
        branchResults.map(([particle]) => particle.src),
        "после второго уровня Fuzzy должен раскрыть все static Wimp из enum values",
      ).toEqual(values.map((value) => `zavx0z/git-${value}`))
      expect(
        branchResults.map(([, continuation]) => continuation),
        "Fuzzy-ветви должны отдавать continuation, рассчитанный на родительском meta-уровне",
      ).toEqual(values.map(() => ({ values: { operation: null, args: null } })))
      expect(
        branchResults.every(([particle]) => particle.values === undefined),
        "обнаруженные Wimp-ветви ещё не должны иметь values",
      ).toBe(true)
      expect(
        branchResults.every(([particle]) => particle.mass === undefined),
        "обнаруженные Wimp-ветви ещё не должны иметь mass",
      ).toBe(true)
      expect(childResult, "после второго уровня Axion должен получить дочерний Wimp в dark$").toBeDefined()
      expect(childResult?.[0].src, "дочерний Wimp должен сохранять статический src из child meta").toBe("zavx0z/git-error")
      expect(childResult?.[0].values, "дочерний Wimp тоже должен оставаться пустым до своей meta").toBeUndefined()
      expect(childResult?.[0].mass, "дочерний Wimp не должен получать mass до входа в свой pipeline").toBeUndefined()
      expect(childResult?.[1], "дочерний Wimp должен вернуть continuation для своей meta").toEqual({
        values: { message: null },
      })
      expect(rootFuzzy.children, "Fuzzy должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchResults.map(([particle]) => particle.id)),
      )
      expect(rootAxion.children, "Axion должен содержать связь на дочерний Wimp").toEqual(new Set([childResult![0].id]))
      expect(dark$.meta, "meta lookup после второго уровня должен содержать root и все materialized Wimp").toEqual(
        new Map([[wimp.id, src], ...secondLayer.map(([particle]) => [particle.id, particle.src] as const)]),
      )
      for (const [particle] of branchResults) {
        expect(dark$.parent.get(particle), "parent каждой enum Wimp-ветви должен быть Fuzzy").toBe(rootFuzzy)
      }
      expect(dark$.parent.get(childResult![0]), "parent дочернего Wimp должен быть Axion").toBe(rootAxion)
      expect(
        secondLayer.map(([particle]) => particle.src),
        "второй слой должен вернуть все обнаруженные Wimp текущей meta",
      ).toEqual([...values.map((value) => `zavx0z/git-${value}`), "zavx0z/git-error"])
    })
    test("завершение генератора", () => {
      const end = generator.next()

      expect(end.done, "generator должен завершиться после второго уровня").toBe(true)
      expect(end.value, "после завершения generator не должен возвращать дополнительный результат").toBeUndefined()
    })
  })

  describe("zavx0z/git-start", () => {
    let ast: MetaAST
    let wimp: Wimp
    let continuation: MatterWimpResult[1]
    let generator: ReturnType<typeof matterPipeline>
    let childFuzzy: Fuzzy
    let childResults: MatterWimpResult[] = []

    test("создание root wimp", () => {
      // Следующая meta берёт пустой Wimp и continuation, возвращённые родительским проходом.
      const result = rootResults.find(([particle]) => particle.src === startSrc)
      if (!result) throw new Error("git-start wimp is not found")

      ;[wimp, continuation] = result

      expect(wimp, "первый continuation Wimp из root meta должен существовать").toBeDefined()
      expect(wimp.src, "первый continuation Wimp должен быть git-start").toBe(startSrc)
      expect(continuation, "git-start Wimp должен прийти вместе с continuation от родителя").toEqual({
        values: {
          operation: null,
          args: null,
        },
      })
      expect(wimp.values, "до входа в дочернюю meta Wimp должен оставаться пустым").toBeUndefined()
      expect(wimp.mass, "до входа в дочернюю meta mass тоже не должен быть выставлен").toBeUndefined()
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
      // Дочерний pipeline тоже ничего не делает до первого next.
      generator = matterPipeline(wimp, ast, continuation)

      expect(generator, "generator для git-start должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator для git-start должен иметь метод next").toBe("function")
      expect(wimp.values, "до первого next дочерний Wimp должен оставаться пустым").toBeUndefined()
    })
    test("обработка первого уровня", () => {
      // На первом шаге дочерней meta continuation применяется к root Wimp,
      // а наружу всё равно возвращается пустой слой, потому что новых Wimp ещё нет.
      const firstLevel = generator.next()
      if (firstLevel.done) throw new Error("first git-start level is done")

      const firstLayer = firstLevel.value
      const materialized = Array.from(dark$.particles.values())

      expect(firstLevel.done, "первый слой git-start не должен завершать generator").toBe(false)
      expect(firstLayer, "первый слой git-start должен вернуть пустой список Wimp-результатов").toEqual([])
      expect(wimp.values, "continuation должен примениться только на первом next дочерней meta").toEqual({
        operation: null,
        args: null,
      })
      expect(wimp.mass, "при пустой mass дочерней meta root Wimp не должен получать mass").toBeUndefined()
      expect(dark$.particles.get(wimp.id), "дочерний root Wimp должен быть сохранён в dark$.particles").toBe(wimp)
      expect(dark$.meta.get(wimp.id), "meta lookup должен продолжать хранить src дочернего Wimp").toBe(startSrc)

      childFuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && dark$.parent.get(particle) === wimp,
      )!

      expect(childFuzzy, "после первого уровня git-start в dark$ должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(wimp.children, "git-start Wimp должен получить связь на Fuzzy первого уровня").toContain(childFuzzy.id)
      expect(childFuzzy.children, "на первом уровне git-start Fuzzy ещё не должен иметь дочерних частиц").toEqual(
        new Set(),
      )
      expect(childResults, "на первом уровне git-start список continuation-пар ещё должен быть пустым").toEqual([])
    })
    test("обработка второго уровня", () => {
      // На втором шаге дочерняя meta только обнаруживает свои дочерние Wimp-ветви.
      const secondLevel = generator.next()
      if (secondLevel.done) throw new Error("second git-start level is done")

      const secondLayer = secondLevel.value
      const values = ast.fields.operation?.values ?? []
      const branchResults = secondLayer.filter(([particle]) => dark$.parent.get(particle) === childFuzzy)

      expect(secondLevel.done, "второй слой git-start не должен завершать generator").toBe(false)
      expect(secondLayer, "второй цикл git-start должен вернуть только continuation Wimp этого уровня").toHaveLength(
        values.length,
      )

      childResults = secondLayer
      expect(
        branchResults.map(([particle]) => particle.src),
        "после второго уровня git-start Fuzzy должен раскрыть все static Wimp из enum values",
      ).toEqual(values.map((value) => `zavx0z/git-start-${value}`))
      expect(
        branchResults.map(([, nextContinuation]) => nextContinuation),
        "continuation git-start должен сохранять payload для следующего meta-уровня",
      ).toEqual(values.map(() => ({ values: { args: null } })))
      expect(
        branchResults.every(([particle]) => particle.values === undefined),
        "ветви git-start должны оставаться пустыми до своей meta",
      ).toBe(true)
      expect(
        branchResults.every(([particle]) => particle.mass === undefined),
        "ветви git-start не должны получать mass заранее",
      ).toBe(true)
      expect(childFuzzy.children, "Fuzzy git-start должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchResults.map(([particle]) => particle.id)),
      )
      expect(
        secondLayer.map(([particle]) => particle.src),
        "второй слой git-start должен вернуть все обнаруженные Wimp",
      ).toEqual(values.map((value) => `zavx0z/git-start-${value}`))
      for (const [particle] of branchResults) {
        expect(dark$.particles.get(particle.id), "после записи Wimp git-start должен попасть в dark$.particles").toBe(
          particle,
        )
        expect(dark$.parent.get(particle), "после записи parent Wimp git-start должен быть сохранён").toBe(childFuzzy)
      }
    })
    test("завершение генератора", () => {
      const end = generator.next()

      expect(end.done, "generator git-start должен завершиться после второго уровня").toBe(true)
      expect(end.value, "после завершения generator git-start не должен возвращать дополнительный результат").toBeUndefined()
    })
  })
})
