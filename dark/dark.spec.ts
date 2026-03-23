import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { HubFixture } from "fixture"
import reference from "../github/zavx0z/git/meta.json"
import startReference from "../github/zavx0z/git-start/meta.json"

import type { MatterWimpResult } from "@dark/types/dark"
import { Axion, Fuzzy, Wimp } from "@dark/strong"
import { matterMeta } from "./dark.ts"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")

const src = "zavx0z/git"
const startSrc = "zavx0z/git-start"
const ref = reference as MetaAST
const startRef = startReference as MetaAST

describe("zavx0z/git", () => {
  beforeAll(async () => await hub.setup())
  afterAll(async () => {
    dark$.meta.clear()
    dark$.particles.clear()
    await hub.teardown()
  })

  let rootResults: MatterWimpResult[] = []

  describe("zavx0z/git", () => {
    let rootFuzzy: Fuzzy
    let rootAxion: Axion

    let wimp: Wimp
    test("создание wimp", () => {
      wimp = new Wimp({ src, parent: null })

      expect(wimp.values, "до запуска pipeline root Wimp должен оставаться пустым").toBeUndefined()
      expect(wimp.mass, "до запуска pipeline root Wimp не должен иметь mass").toBeUndefined()
      expect(dark$.particles.size, "до первого шага pipeline root Wimp ещё не должен попасть в dark$.particles").toBe(0)
      expect(dark$.meta.size, "до первого шага pipeline meta lookup тоже должен быть пустым").toBe(0)
    })
    let generator: ReturnType<typeof matterMeta>
    test("создание генератора", () => {
      // Сам pipeline ещё ничего не делает до первого next.
      generator = matterMeta(wimp)

      expect(generator, "generator должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator должен иметь метод next").toBe("function")
      expect(wimp.values, "создание generator не должно преждевременно инициализировать root Wimp").toBeUndefined()
    })
    test("обработка первого уровня", async () => {
      // Первый next инициализирует root Wimp и проходит первый слой topology.
      // На этом уровне новых Wimp ещё нет, поэтому наружу возвращается пустой слой.
      const firstLevel = await generator.next()
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
      expect(wimp.name, "root Wimp должен хранить локальное имя своей meta").toBe(ref.name)
      expect(wimp.fields, "root Wimp должен хранить локальную fields-схему своей meta").toEqual(ref.fields)
      expect(wimp.fields, "fields должны принадлежать самому Wimp, а не оставаться ссылкой на AST").not.toBe(ref.fields)
      expect(
        wimp.superposition,
        "root Wimp должен хранить локальную superposition своей meta",
      ).toEqual(ref.superposition)
      expect(
        wimp.superposition,
        "superposition должна принадлежать самому Wimp, а не оставаться ссылкой на AST",
      ).not.toBe(ref.superposition)
      expect(wimp.processes, "root Wimp должен хранить локальные processes своей meta").toEqual(ref.processes)
      expect(wimp.processes, "processes должны принадлежать самому Wimp, а не оставаться ссылкой на AST").not.toBe(
        ref.processes,
      )
      expect(wimp.reactions, "если reactions в meta нет, Wimp не должен создавать её искусственно").toBeUndefined()
      expect(wimp.bulk, "если bulk в meta нет, Wimp не должен создавать её искусственно").toBeUndefined()
      if (ref.mass && Object.keys(ref.mass).length > 0) {
        expect(wimp.mass, "mass должен присваиваться root Wimp при входе в pipeline").toEqual(ref.mass)
        expect(wimp.mass, "mass тоже должна принадлежать самому Wimp, а не AST").not.toBe(ref.mass)
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
        new Set([rootFuzzy, rootAxion]),
      )
      expect(rootFuzzy.children, "на первом уровне Fuzzy ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(rootAxion.children, "на первом уровне Axion ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(rootFuzzy.parent, "parent Fuzzy первого уровня должен быть root Wimp").toBe(wimp)
      expect(rootAxion.parent, "parent Axion первого уровня должен быть root Wimp").toBe(wimp)
      expect(rootResults, "до второго слоя ещё не должно быть внешних Wimp-результатов").toEqual([])
    })
    test("обработка второго уровня", async () => {
      // Второй слой обнаруживает дочерние Wimp и сразу отдаёт пары [wimp, continuation].
      const secondLevel = await generator.next()
      const values = ref.fields.operation?.values ?? []
      if (secondLevel.done) throw new Error("second level is done")

      const secondLayer = secondLevel.value
      const branchResults = secondLayer.filter(([particle]) => particle.parent === rootFuzzy)
      const childResult = secondLayer.find(([particle]) => particle.parent === rootAxion)

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
      expect(
        branchResults.every(([particle]) => particle.fields === undefined && particle.superposition === undefined),
        "обнаруженные Wimp-ветви ещё не должны получать локальные AST-данные до загрузки своей meta",
      ).toBe(true)
      expect(childResult, "после второго уровня Axion должен получить дочерний Wimp в dark$").toBeDefined()
      expect(childResult?.[0].src, "дочерний Wimp должен сохранять статический src из child meta").toBe(
        "zavx0z/git-error",
      )
      expect(childResult?.[0].values, "дочерний Wimp тоже должен оставаться пустым до своей meta").toBeUndefined()
      expect(childResult?.[0].mass, "дочерний Wimp не должен получать mass до входа в свой pipeline").toBeUndefined()
      expect(childResult?.[1], "дочерний Wimp должен вернуть continuation для своей meta").toEqual({
        values: { message: null },
      })
      expect(rootFuzzy.children, "Fuzzy должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchResults.map(([particle]) => particle)),
      )
      expect(rootAxion.children, "Axion должен содержать связь на дочерний Wimp").toEqual(new Set([childResult![0]]))
      expect(dark$.meta, "meta lookup после второго уровня должен содержать root и все materialized Wimp").toEqual(
        new Map([[wimp.id, src], ...secondLayer.map(([particle]) => [particle.id, particle.src] as const)]),
      )
      for (const [particle] of branchResults) {
        expect(particle.parent, "parent каждой enum Wimp-ветви должен быть Fuzzy").toBe(rootFuzzy)
      }
      expect(childResult![0].parent, "parent дочернего Wimp должен быть Axion").toBe(rootAxion)
      expect(
        secondLayer.map(([particle]) => particle.src),
        "второй слой должен вернуть все обнаруженные Wimp текущей meta",
      ).toEqual([...values.map((value) => `zavx0z/git-${value}`), "zavx0z/git-error"])
    })
    test("завершение генератора", async () => {
      const end = await generator.next()

      expect(end.done, "generator должен завершиться после второго уровня").toBe(true)
      expect(end.value, "после завершения generator не должен возвращать дополнительный результат").toBeUndefined()
    })
  })

  describe("zavx0z/git-start", () => {
    let wimp: Wimp
    let continuation: MatterWimpResult[1]
    let childFuzzy: Fuzzy
    let childResults: MatterWimpResult[] = []
    test("создание root wimp", () => {
      // Следующая meta берёт пустой Wimp и continuation, возвращённые родительским проходом.
      const result = rootResults[0]
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
    let generator: ReturnType<typeof matterMeta>
    test("создание генератора", () => {
      // Дочерний pipeline сам загрузит AST по wimp.src и ничего не делает до первого next.
      generator = matterMeta(wimp, continuation)

      expect(generator, "generator для git-start должен быть создан").toBeDefined()
      expect(typeof generator.next, "generator для git-start должен иметь метод next").toBe("function")
      expect(wimp.values, "до первого next дочерний Wimp должен оставаться пустым").toBeUndefined()
    })
    test("обработка первого уровня", async () => {
      // На первом шаге дочерней meta continuation применяется к root Wimp,
      // а наружу всё равно возвращается пустой слой, потому что новых Wimp ещё нет.
      const firstLevel = await generator.next()
      if (firstLevel.done) throw new Error("first git-start level is done")

      const firstLayer = firstLevel.value
      const materialized = Array.from(dark$.particles.values())

      expect(firstLevel.done, "первый слой git-start не должен завершать generator").toBe(false)
      expect(firstLayer, "первый слой git-start должен вернуть пустой список Wimp-результатов").toEqual([])
      expect(wimp.values, "continuation должен примениться только на первом next дочерней meta").toEqual({
        operation: null,
        args: null,
      })
      expect(wimp.name, "дочерний Wimp должен хранить локальное имя своей meta").toBe(startRef.name)
      expect(wimp.fields, "дочерний Wimp должен хранить локальную fields-схему своей meta").toEqual(startRef.fields)
      expect(
        wimp.superposition,
        "дочерний Wimp должен хранить локальную superposition своей meta",
      ).toEqual(startRef.superposition)
      expect(wimp.processes, "дочерний Wimp должен хранить локальные processes своей meta").toEqual(startRef.processes)
      expect(wimp.mass, "при пустой mass дочерней meta root Wimp не должен получать mass").toBeUndefined()
      expect(dark$.particles.get(wimp.id), "дочерний root Wimp должен быть сохранён в dark$.particles").toBe(wimp)
      expect(dark$.meta.get(wimp.id), "meta lookup должен продолжать хранить src дочернего Wimp").toBe(startSrc)

      childFuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && particle.parent === wimp,
      )!

      expect(childFuzzy, "после первого уровня git-start в dark$ должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(wimp.children, "git-start Wimp должен получить связь на Fuzzy первого уровня").toContain(childFuzzy)
      expect(childFuzzy.children, "на первом уровне git-start Fuzzy ещё не должен иметь дочерних частиц").toEqual(
        new Set(),
      )
      expect(childResults, "на первом уровне git-start список continuation-пар ещё должен быть пустым").toEqual([])
    })
    test("обработка второго уровня", async () => {
      // На втором шаге дочерняя meta только обнаруживает свои дочерние Wimp-ветви.
      const secondLevel = await generator.next()
      if (secondLevel.done) throw new Error("second git-start level is done")

      const secondLayer = secondLevel.value
      const branchResults = secondLayer.filter(([particle]) => particle.parent === childFuzzy)

      expect(secondLevel.done, "второй слой git-start не должен завершать generator").toBe(false)
      expect(secondLayer, "второй цикл git-start должен вернуть только continuation Wimp этого уровня").toHaveLength(2)

      childResults = secondLayer
      expect(
        branchResults.map(([particle]) => particle.src),
        "после второго уровня git-start Fuzzy должен раскрыть все static Wimp из enum values",
      ).toEqual(["zavx0z/git-start-clone", "zavx0z/git-start-init"])
      expect(
        branchResults.map(([, nextContinuation]) => nextContinuation),
        "continuation git-start должен сохранять payload для следующего meta-уровня",
      ).toEqual([{ values: { args: null } }, { values: { args: null } }])
      expect(
        branchResults.every(([particle]) => particle.values === undefined),
        "ветви git-start должны оставаться пустыми до своей meta",
      ).toBe(true)
      expect(
        branchResults.every(([particle]) => particle.mass === undefined),
        "ветви git-start не должны получать mass заранее",
      ).toBe(true)
      expect(childFuzzy.children, "Fuzzy git-start должен содержать связи на все materialized Wimp-ветви").toEqual(
        new Set(branchResults.map(([particle]) => particle)),
      )
      expect(
        secondLayer.map(([particle]) => particle.src),
        "второй слой git-start должен вернуть все обнаруженные Wimp",
      ).toEqual(["zavx0z/git-start-clone", "zavx0z/git-start-init"])
      for (const [particle] of branchResults) {
        expect(dark$.particles.get(particle.id), "после записи Wimp git-start должен попасть в dark$.particles").toBe(
          particle,
        )
        expect(particle.parent, "после записи parent Wimp git-start должен быть сохранён").toBe(childFuzzy)
      }
    })
    test("завершение генератора", async () => {
      const end = await generator.next()

      expect(end.done, "generator git-start должен завершиться после второго уровня").toBe(true)
      expect(
        end.value,
        "после завершения generator git-start не должен возвращать дополнительный результат",
      ).toBeUndefined()
    })
  })
})
