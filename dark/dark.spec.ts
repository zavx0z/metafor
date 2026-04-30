import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { MetaDSL } from "../index.ts"
import { HubFixture } from "fixture"
import reference from "../github/zavx0z/git/meta.ts"
import startReference from "../github/zavx0z/git-start/meta.ts"

import type { MatterWimpResult } from "@dark/types/dark"
import { Axion, Fuzzy, readFieldValues, Wimp } from "@dark/strong"
import { open } from "../store/server.ts"
import { matterMeta } from "./dark.ts"
import { loadMeta } from "./load.ts"
import { dark$ } from "./store"

const hub = new HubFixture()

const src = "zavx0z/git"
const startSrc = "zavx0z/git-start"
const ref = reference as MetaDSL
const startRef = startReference as MetaDSL

const readWimpValues = (wimp: Wimp) => readFieldValues(wimp.fields)
const readFieldInitValues = (fieldInits?: MatterWimpResult[1]["fieldInits"]) =>
  Object.fromEntries((fieldInits ?? []).map(({ key, value }) => [key, value]))

const findFieldInit = (continuation: MatterWimpResult[1], key: string) =>
  continuation.fieldInits?.find((fieldInit) => fieldInit.key === key)

describe("zavx0z/git", () => {
  let store: Awaited<ReturnType<typeof open>>

  beforeAll(async () => {
    await hub.setup()
    store = await open(":memory:")
    await loadMeta(src, store)
    await loadMeta(startSrc, store)
  })
  afterAll(async () => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    dark$.metaIndex.clear()
    await store.close()
    await hub.teardown()
  })

  let rootResults: MatterWimpResult[] = []
  let rootWimp: Wimp

  describe("zavx0z/git", () => {
    let rootFuzzy: Fuzzy
    let rootAxion: Axion

    test("создание корневого Wimp", () => {
      rootWimp = new Wimp({ src, parent: null })

      expect(rootWimp.fields, "до запуска прохода корневой Wimp должен оставаться пустым").toBeUndefined()
      expect(rootWimp.mass, "до запуска прохода корневой Wimp не должен иметь `mass`").toBeUndefined()
      expect(dark$.particles.size, "до первого шага прохода корневой Wimp ещё не должен попасть в dark$.particles").toBe(0)
      expect(dark$.meta.size, "до первого шага прохода таблица мет тоже должна быть пустой").toBe(0)
      expect(dark$.fields.size, "до первого шага таблица meta-полей тоже должна быть пустой").toBe(0)
    })

    let generator: ReturnType<typeof matterMeta>
    test("создание генератора", () => {
      generator = matterMeta(rootWimp, undefined, { store })

      expect(generator, "генератор должен быть создан").toBeDefined()
      expect(typeof generator.next, "генератор должен иметь метод `next`").toBe("function")
      expect(rootWimp.fields, "создание генератора не должно преждевременно инициализировать корневой Wimp").toBeUndefined()
    })

    test("обработка первого уровня", async () => {
      const firstLevel = await generator.next()
      if (firstLevel.done) throw new Error("first level is done")

      const firstLayer = firstLevel.value
      const materialized = Array.from(dark$.particles.values())

      expect(firstLevel.done, "первый слой не должен завершать генератор").toBe(false)
      expect(firstLayer, "первый слой должен вернуть пустой список Wimp-результатов").toEqual([])
      expect(readWimpValues(rootWimp), "корневой Wimp должен получить объектные поля только на первом `next`").toEqual({
        operation: null,
        error: null,
        command: null,
        args: null,
      })
      expect(rootWimp.meta, "корневой Wimp должен ссылаться на materialized Meta").toBeDefined()
      expect(rootWimp.name, "корневой Wimp должен хранить локальное имя своей меты").toBe(ref.name)
      expect(Object.keys(rootWimp.fields ?? {}), "корневой Wimp должен хранить объектные поля для всех ключей схемы").toEqual(
        Object.keys(ref.fields),
      )
      expect(rootWimp.fields!.operation!.owner, "каждое поле должно знать владельца").toBe(rootWimp)
      expect(rootWimp.fields!.operation!.schema, "поле должно хранить свою схему").toEqual(ref.fields.operation!)
      expect(rootWimp.fields!.operation!.schema, "схема поля не должна оставаться ссылкой на исходный AST").not.toBe(
        ref.fields.operation!,
      )
      expect(rootWimp.fields!.operation!.metaField, "instance field должен ссылаться на канонический `MetaField`").toBe(
        rootWimp.meta!.fields.operation!,
      )
      expect(rootWimp.fields!.command!.value, "поле должно хранить текущее значение").toBeNull()
      expect(rootWimp.fields!.command!.source, "локальное поле без родителя должно иметь `source = null`").toBeNull()
      expect(
        rootWimp.superposition,
        "корневой Wimp должен хранить локальную `superposition` своей меты",
      ).toEqual(ref.superposition)
      expect(
        rootWimp.superposition,
        "`superposition` должна принадлежать самому Wimp, а не оставаться ссылкой на AST",
      ).not.toBe(ref.superposition)
      expect(rootWimp.processes, "корневой Wimp должен хранить локальные `processes` своей меты").toEqual(ref.processes)
      expect(rootWimp.processes, "`processes` должны принадлежать самому Wimp, а не оставаться ссылкой на AST").not.toBe(
        ref.processes,
      )
      expect(rootWimp.reactions, "если `reactions` в мете нет, Wimp не должен создавать её искусственно").toBeUndefined()
      expect(rootWimp.bulk, "если `bulk` в мете нет, Wimp не должен создавать его искусственно").toBeUndefined()
      if (ref.mass && Object.keys(ref.mass).length > 0) {
        expect(rootWimp.mass, "`mass` должен присваиваться корневому Wimp при входе в проход").toEqual(ref.mass)
        expect(rootWimp.mass, "`mass` тоже должна принадлежать самому Wimp, а не AST").not.toBe(ref.mass)
      } else {
        expect(rootWimp.mass, "при пустом `ast.mass` корневой Wimp не должен получать `mass`").toBeUndefined()
      }

      rootFuzzy = materialized.find((particle): particle is Fuzzy => particle instanceof Fuzzy)!
      rootAxion = materialized.find((particle): particle is Axion => particle instanceof Axion)!

      expect(rootFuzzy, "на первом уровне должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(rootAxion, "на первом уровне должен появиться Axion").toBeInstanceOf(Axion)
      expect(dark$.particles.size, "после первого уровня в dark$ должны быть корневой Wimp, Fuzzy и Axion").toBe(3)
      expect(dark$.particles.get(rootWimp.id), "dark$ должен хранить корневой Wimp по `id`").toBe(rootWimp)
      expect(dark$.meta, "таблица мет после первого уровня должна содержать только materialized Meta корня").toEqual(
        new Map(rootWimp.meta ? [[rootWimp.meta.id, rootWimp.meta]] : []),
      )
      expect(
        dark$.fields.size,
        "после первого уровня таблица meta-полей должна содержать каноническую схему только корневой меты",
      ).toBe(Object.keys(ref.fields).length)
      expect(rootFuzzy.value, "Fuzzy без выбранного enum значения должен быть пустым").toBeNull()
      expect((rootAxion as any)?.basis, "Axion не должен хранить `basis`").toBeUndefined()
      expect((rootAxion as any)?.expr, "Axion не должен хранить `expr`").toBeUndefined()
      expect(rootWimp.children, "корневой Wimp должен получить связи на Fuzzy и Axion первого уровня").toEqual(
        new Set([rootFuzzy, rootAxion]),
      )
      expect(rootFuzzy.children, "на первом уровне Fuzzy ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(rootAxion.children, "на первом уровне Axion ещё не должен иметь дочерних Wimp").toEqual(new Set())
      expect(rootFuzzy.parent, "`parent` Fuzzy первого уровня должен быть корневым Wimp").toBe(rootWimp)
      expect(rootAxion.parent, "`parent` Axion первого уровня должен быть корневым Wimp").toBe(rootWimp)
      expect(rootResults, "до второго слоя ещё не должно быть внешних Wimp-результатов").toEqual([])
    })

    test("обработка второго уровня", async () => {
      const secondLevel = await generator.next()
      const values = ref.fields.operation?.values ?? []
      if (secondLevel.done) throw new Error("second level is done")

      const secondLayer = secondLevel.value
      const branchResults = secondLayer.filter(([particle]) => particle.parent === rootFuzzy)
      const childResult = secondLayer.find(([particle]) => particle.parent === rootAxion)

      rootResults = secondLayer

      expect(secondLevel.done, "второй слой не должен завершать генератор").toBe(false)
      expect(secondLayer, "второй слой должен вернуть все Wimp, обнаруженные на этом шаге").toHaveLength(
        values.length + 1,
      )
      expect(dark$.particles.size, "после второго уровня в dark$ должны быть корень, Fuzzy, Axion и все ветви Wimp").toBe(
        values.length + 4,
      )
      expect(
        branchResults.map(([particle]) => particle.src),
        "после второго уровня Fuzzy должен раскрыть все статические Wimp из значений `enum`",
      ).toEqual(values.map((value) => `zavx0z/git-${value}`))
      for (const [, continuation] of branchResults) {
        expect(
          readFieldInitValues(continuation.fieldInits),
          "ветви Fuzzy должны отдавать набор `FieldInit`, подготовленный на уровне родительской меты",
        ).toEqual({ operation: null, args: null })
        expect(
          findFieldInit(continuation, "operation")?.source,
          "поле `enum` не должно участвовать в прямой связи по источнику даже внутри временного пакета",
        ).toBeUndefined()
        expect(findFieldInit(continuation, "args")?.source, "обычное поле должно ссылаться на поле родителя").toBe(
          rootWimp.fields!.args,
        )
      }
      expect(
        branchResults.every(([particle]) => particle.mass === undefined),
        "обнаруженные ветви Wimp ещё не должны иметь `mass`",
      ).toBe(true)
      expect(
        branchResults.every(([particle]) => particle.fields === undefined && particle.superposition === undefined),
        "обнаруженные ветви Wimp ещё не должны получать локальные данные AST до загрузки своей меты",
      ).toBe(true)
      expect(childResult, "после второго уровня Axion должен получить дочерний Wimp в dark$").toBeDefined()
      expect(childResult?.[0].src, "дочерний Wimp должен сохранять статический `src` из дочерней меты").toBe(
        "zavx0z/git-error",
      )
      expect(childResult?.[0].fields, "дочерний Wimp тоже должен оставаться пустым до своей меты").toBeUndefined()
      expect(childResult?.[0].mass, "дочерний Wimp не должен получать `mass` до входа в свой проход").toBeUndefined()
      expect(readFieldInitValues(childResult?.[1].fieldInits), "дочерний Wimp должен вернуть набор `FieldInit` для своей меты").toEqual(
        { message: null },
      )
      expect(findFieldInit(childResult![1], "message")?.source).toBe(rootWimp.fields!.error)
      expect(rootFuzzy.children, "Fuzzy должен содержать связи на все собранные ветви Wimp").toEqual(
        new Set(branchResults.map(([particle]) => particle)),
      )
      expect(rootAxion.children, "Axion должен содержать связь на дочерний Wimp").toEqual(new Set([childResult![0]]))
      expect(
        dark$.meta,
        "обнаружение дочерних Wimp не должно создавать новые Meta до входа в их собственный materialization проход",
      ).toEqual(new Map(rootWimp.meta ? [[rootWimp.meta.id, rootWimp.meta]] : []))
      for (const [particle] of branchResults) {
        expect(particle.parent, "`parent` каждой ветви Wimp из `enum` должен быть Fuzzy").toBe(rootFuzzy)
      }
      expect(childResult![0].parent, "`parent` дочернего Wimp должен быть Axion").toBe(rootAxion)
      expect(
        secondLayer.map(([particle]) => particle.src),
        "второй слой должен вернуть все обнаруженные Wimp текущей меты",
      ).toEqual([...values.map((value) => `zavx0z/git-${value}`), "zavx0z/git-error"])
    })

    test("завершение генератора", async () => {
      const end = await generator.next()

      expect(end.done, "генератор должен завершиться после второго уровня").toBe(true)
      expect(end.value, "после завершения генератор не должен возвращать дополнительный результат").toBeUndefined()
    })
  })

  describe("zavx0z/git-start", () => {
    let startWimp: Wimp
    let startContinuation: MatterWimpResult[1]
    let childFuzzy: Fuzzy
    let childResults: MatterWimpResult[] = []

    test("создание корневого Wimp дочерней меты", () => {
      const result = rootResults[0]
      if (!result) throw new Error("Wimp git-start не найден")
      ;[startWimp, startContinuation] = result

      expect(startWimp, "первый Wimp из временного пакета корневой меты должен существовать").toBeDefined()
      expect(startWimp.src, "первый Wimp из временного пакета должен быть git-start").toBe(startSrc)
      expect(startContinuation, "Wimp git-start должен прийти вместе с набором описаний полей от родителя").toEqual({
        fieldInits: [
          { key: "operation", value: null },
          { key: "args", value: null, source: rootWimp.fields!.args! },
        ],
      })
      expect(startWimp.fields, "до входа в дочернюю мету Wimp должен оставаться пустым").toBeUndefined()
      expect(startWimp.mass, "до входа в дочернюю мету `mass` тоже не должен быть выставлен").toBeUndefined()
    })

    let generator: ReturnType<typeof matterMeta>
    test("создание генератора", () => {
      generator = matterMeta(startWimp, startContinuation, { store })

      expect(generator, "генератор для git-start должен быть создан").toBeDefined()
      expect(typeof generator.next, "генератор для git-start должен иметь метод `next`").toBe("function")
      expect(startWimp.fields, "до первого `next` дочерний Wimp должен оставаться пустым").toBeUndefined()
    })

    test("обработка первого уровня", async () => {
      const firstLevel = await generator.next()
      if (firstLevel.done) throw new Error("first git-start level is done")

      const firstLayer = firstLevel.value
      const materialized = Array.from(dark$.particles.values())

      expect(firstLevel.done, "первый слой git-start не должен завершать генератор").toBe(false)
      expect(firstLayer, "первый слой git-start должен вернуть пустой список Wimp-результатов").toEqual([])
      expect(readWimpValues(startWimp), "набор `FieldInit` должен примениться только на первом `next` дочерней меты").toEqual({
        operation: null,
        args: null,
      })
      expect(startWimp.meta, "дочерний Wimp должен получить ссылку на materialized Meta").toBeDefined()
      expect(startWimp.name, "дочерний Wimp должен хранить локальное имя своей меты").toBe(startRef.name)
      expect(
        Object.keys(startWimp.fields ?? {}),
        "дочерний Wimp должен собирать собственный объектный набор полей",
      ).toEqual(Object.keys(startRef.fields))
      expect(startWimp.fields!.operation!.schema).toEqual(startRef.fields.operation!)
      expect(startWimp.fields!.args!.owner, "поле дочернего Wimp должно знать владельца").toBe(startWimp)
      expect(startWimp.fields!.args!.source, "обычное поле должно ссылаться на поле родительского Wimp").toBe(
        rootWimp.fields!.args!,
      )
      expect(
        startWimp.fields!.operation!.source,
        "топологическое поле `enum` не должно смешиваться с прямой связью по источнику",
      ).toBeNull()
      expect(
        startWimp.superposition,
        "дочерний Wimp должен хранить локальную `superposition` своей меты",
      ).toEqual(startRef.superposition)
      // После удаления has_processes/reactions/matter флагов из БД пустой объект `{}` в DSL
       // и отсутствие секции читаются одинаково — как `undefined`. Сравниваем через
      // нормализацию: и `{}` и `undefined` считаются "пустыми".
      expect(startWimp.processes ?? {}, "дочерний Wimp должен хранить локальные `processes` своей меты").toEqual(
        startRef.processes ?? {},
      )
      expect(startWimp.mass, "при пустой `mass` дочерней меты корневой Wimp не должен получать `mass`").toBeUndefined()
      expect(dark$.particles.get(startWimp.id), "дочерний корневой Wimp должен быть сохранён в dark$.particles").toBe(
        startWimp,
      )
      expect(
        [...dark$.meta.values()].some((meta) => meta === startWimp.meta && meta.src === startSrc),
        "таблица мет должна хранить materialized Meta дочернего Wimp отдельно от particle instance",
      ).toBe(true)

      childFuzzy = materialized.find(
        (particle): particle is Fuzzy => particle instanceof Fuzzy && particle.parent === startWimp,
      )!

      expect(childFuzzy, "после первого уровня git-start в dark$ должен появиться Fuzzy").toBeInstanceOf(Fuzzy)
      expect(startWimp.children, "git-start Wimp должен получить связь на Fuzzy первого уровня").toContain(childFuzzy)
      expect(childFuzzy.children, "на первом уровне git-start Fuzzy ещё не должен иметь дочерних частиц").toEqual(
        new Set(),
      )
      expect(childResults, "на первом уровне git-start список continuation-пар ещё должен быть пустым").toEqual([])

      const argsInit = findFieldInit(startContinuation, "args")
      if (!argsInit) throw new Error("описание поля args не найдено")
      argsInit.value = "--mutated-after-materialization"
      expect(
        readWimpValues(startWimp),
        "временный пакет после применения не должен становиться каноническим слоем хранения",
      ).toEqual({
        operation: null,
        args: null,
      })
      expect((startWimp as Wimp & { fieldInits?: unknown }).fieldInits).toBeUndefined()
    })

    test("обработка второго уровня", async () => {
      const secondLevel = await generator.next()
      if (secondLevel.done) throw new Error("second git-start level is done")

      const secondLayer = secondLevel.value
      const branchResults = secondLayer.filter(([particle]) => particle.parent === childFuzzy)

      expect(secondLevel.done, "второй слой git-start не должен завершать генератор").toBe(false)
      expect(secondLayer, "второй цикл git-start должен вернуть только Wimp с временными пакетами этого уровня").toHaveLength(2)

      childResults = secondLayer
      expect(
        branchResults.map(([particle]) => particle.src),
        "после второго уровня git-start Fuzzy должен раскрыть все статические Wimp из значений `enum`",
      ).toEqual(["zavx0z/git-start-clone", "zavx0z/git-start-init"])
      expect(
        branchResults.map(([, nextContinuation]) => readFieldInitValues(nextContinuation.fieldInits)),
        "временный пакет git-start должен сохранять `FieldInit` для следующего уровня меты",
      ).toEqual([{ args: null }, { args: null }])
      for (const [, nextContinuation] of branchResults) {
        expect(findFieldInit(nextContinuation, "args")?.source).toBe(startWimp.fields!.args)
      }
      expect(
        branchResults.every(([particle]) => particle.fields === undefined),
        "ветви git-start должны оставаться пустыми до своей меты",
      ).toBe(true)
      expect(
        branchResults.every(([particle]) => particle.mass === undefined),
        "ветви git-start не должны получать `mass` заранее",
      ).toBe(true)
      expect(childFuzzy.children, "Fuzzy git-start должен содержать связи на все собранные ветви Wimp").toEqual(
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
        expect(particle.parent, "после записи `parent` Wimp git-start должен быть сохранён").toBe(childFuzzy)
      }
    })

    test("завершение генератора", async () => {
      const end = await generator.next()

      expect(end.done, "генератор git-start должен завершиться после второго уровня").toBe(true)
      expect(
        end.value,
        "после завершения генератор git-start не должен возвращать дополнительный результат",
      ).toBeUndefined()
    })
  })
})
