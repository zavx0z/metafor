import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import reference from "../github/zavx0z/git/meta.json"
import { HubFixture, installDeterministicIds } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"

import { Axion, Fuzzy, Wimp } from "@dark/part"
import { strong$ } from "@dark/strong"
import { matterPipeline, particleGenerator } from "@dark/gravity"
import { loadMetaAST } from "../dark/load"
import { dark$ } from "./store"
import type { ParticleBuild } from "@dark/gravity/gravity"

const hub = new HubFixture("./github/")
beforeAll(async () => await hub.setup())
afterAll(async () => {
  dark$.meta.clear()
  dark$.particles.clear()
  dark$.parent = new WeakMap()
  strong$.fields.clear()
  strong$.keys.clear()
  strong$.wimp.clear()
  await hub.teardown()
})
const src = "zavx0z/git"
const ref = reference as MetaAST

describe("init", () => {
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

    dark$.particles.set(wimp.id, wimp)
    dark$.meta.set(wimp.id, wimp.src)

    expect(dark$.particles, "root wimp должен быть сохранен в dark$.particles").toEqual(new Map([[wimp.id, wimp]]))
    expect(dark$.meta, "meta lookup должен сохранить src корневого wimp").toEqual(new Map([[wimp.id, src]]))
    expect(dark$.parent, "parent store должен оставаться WeakMap").toBeInstanceOf(WeakMap)
  })
  test("присваивание массы wimp", () => {
    wimp = new Wimp(src)

    if (ref.mass && Object.keys(ref.mass).length > 0) {
      wimp.mass = ref.mass
      expect(wimp.mass, "mass должен присваиваться wimp из ref.mass").toEqual(ref.mass)
      return
    }

    expect(wimp.mass, "mass не должен присваиваться при пустом ref.mass").toBeUndefined()
  })
  let generator: ReturnType<typeof particleGenerator>
  test("создание генератора", () => {
    if (!ast.matter) throw new Error("matter is undefined")

    generator = particleGenerator(wimp, ast.matter, ast.fields)

    expect(generator, "generator должен быть создан").toBeDefined()
    expect(typeof generator.next, "generator должен иметь метод next").toBe("function")
    expect(generator[Symbol.iterator], "generator должен быть итерируемым").toBeDefined()
  })
  let fuzzy: Fuzzy | undefined
  let axion: Axion | undefined
  test("генерация первого уровня", () => {
    const firstLevel = generator.next()

    expect(firstLevel.done, "первый слой не должен завершать generator").toBe(false)
    expect(firstLevel.value, "первый слой должен содержать Fuzzy и Axion с root wimp как parent").toEqual([
      { particle: expect.any(Fuzzy), parent: wimp, meta: {} },
      { particle: expect.any(Axion), parent: wimp, meta: {} },
    ])
    fuzzy = firstLevel.value?.find((build: ParticleBuild) => build.particle instanceof Fuzzy)?.particle
    axion = firstLevel.value?.find((build: ParticleBuild) => build.particle instanceof Axion)?.particle
    expect(fuzzy, "на первом уровне должен материализоваться Fuzzy").toBeDefined()
    expect(axion, "на первом уровне должен материализоваться Axion").toBeDefined()
  })
  test("генерация второго уровня", () => {
    const secondLevel = generator.next()
    const secondLevelWimps = secondLevel.value?.filter((build: ParticleBuild) => build.particle instanceof Wimp) ?? []
    const fuzzyWimp = secondLevelWimps.find((build: ParticleBuild) => build.parent === fuzzy)?.particle as Wimp | undefined
    const childWimp = secondLevelWimps.find((build: ParticleBuild) => build.parent === axion)?.particle as Wimp | undefined

    expect(secondLevel.done, "второй слой не должен завершать generator").toBe(false)
    expect(secondLevel.value, "второй слой должен раскрывать continuation Fuzzy и child ветку Axion").toEqual([
      { particle: expect.any(Wimp), parent: fuzzy!, meta: {} },
      { particle: expect.any(Wimp), parent: axion!, meta: {} },
    ])
    expect(fuzzyWimp, "на втором уровне должен материализоваться continuation Wimp для Fuzzy").toBeDefined()
    expect(fuzzyWimp?.src, "continuation Wimp должен хранить раскрытый src из dynamic meta").toBe("zavx0z/git-${operation}")
    expect(childWimp, "на втором уровне должен материализоваться дочерний Wimp для Axion").toBeDefined()
    expect(childWimp?.src, "дочерний Wimp должен сохранять статический src из child meta").toBe("zavx0z/git-error")
  })
  test("завершение генератора", () => {
    const end = generator.next()

    expect(end.done, "generator должен завершиться после второго уровня").toBe(true)
    expect(end.value, "после завершения generator не должен возвращать следующий слой").toBeUndefined()
  })
  test("matter pipeline сохраняет стабильное состояние графа для одного meta", () => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()

    matterPipeline(wimp, ast)

    const particles = Array.from(dark$.particles.values())
    const fuzzy = particles.find((particle): particle is Fuzzy => particle instanceof Fuzzy)
    const axion = particles.find((particle): particle is Axion => particle instanceof Axion)
    const branchWimps = particles.filter((particle): particle is Wimp => particle instanceof Wimp && particle !== wimp)
    const fuzzyWimp = branchWimps.find((particle) => dark$.parent.get(particle) === fuzzy)
    const childWimp = branchWimps.find((particle) => dark$.parent.get(particle) === axion)

    expect(fuzzy, "matterPipeline должен сохранить Fuzzy в store").toBeDefined()
    expect(axion, "matterPipeline должен сохранить Axion в store").toBeDefined()
    expect(fuzzyWimp, "matterPipeline должен сохранить continuation Wimp для Fuzzy").toBeDefined()
    expect(childWimp, "matterPipeline должен сохранить дочерний Wimp в store").toBeDefined()

    expect(dark$.particles.size, "store должен содержать root и четыре materialized particle").toBe(5)
    expect(wimp.children, "root wimp должен ссылаться на Fuzzy и Axion").toEqual(new Set([fuzzy!.id, axion!.id]))
    expect(fuzzy!.children, "Fuzzy должен ссылаться на continuation Wimp").toEqual(new Set([fuzzyWimp!.id]))
    expect(axion!.children, "Axion должен ссылаться на дочерний Wimp").toEqual(new Set([childWimp!.id]))

    expect(dark$.meta, "meta lookup должен содержать root и оба Wimp второго уровня").toEqual(
      new Map([
        [wimp.id, src],
        [fuzzyWimp!.id, "zavx0z/git-${operation}"],
        [childWimp!.id, "zavx0z/git-error"],
      ]),
    )

    expect(dark$.parent.get(fuzzy!), "parent Fuzzy должен быть root wimp").toBe(wimp)
    expect(dark$.parent.get(axion!), "parent Axion должен быть root wimp").toBe(wimp)
    expect(dark$.parent.get(fuzzyWimp!), "parent continuation Wimp должен быть Fuzzy").toBe(fuzzy)
    expect(dark$.parent.get(childWimp!), "parent дочернего Wimp должен быть Axion").toBe(axion)
  })
  test("сохранение полей в strong$", () => {
    const fieldIds = ["operation-id", "error-id", "command-id", "args-id"]
    const restore = installDeterministicIds(fieldIds)
    try {
      for (const [key, value] of Object.entries(ref.fields)) strong$.push(wimp.id, key, value)

      expect(
        { fields: strong$.fields, keys: strong$.keys, wimp: strong$.wimp },
        "strong$ должен сохранить поля, ids и привязку к wimp",
      ).toEqual({
        fields: new Map([
          [
            "operation",
            {
              label: "Тип операции",
              type: "enum<string>",
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
          ],
          ["error", { label: "Ошибка", type: "string" }],
          ["command", { label: "Команда", type: "string" }],
          ["args", { label: "Аргументы", type: "string" }],
        ]),
        keys: new Map([
          ["operation-id", "operation"],
          ["error-id", "error"],
          ["command-id", "command"],
          ["args-id", "args"],
        ]),
        wimp: new Map([[wimp.id, new Set(fieldIds)]]),
      })
    } finally {
      restore()
    }
  })
})
