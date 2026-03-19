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
    expect(ast.mass, "mass должен быть пустым объектом").toEqual({})
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
  let axion: Axion | undefined
  test("генерация первого уровня", () => {
    const firstLevel = generator.next()
    const fuzzy = firstLevel.value?.find((build) => build.particle instanceof Fuzzy)?.particle

    expect(firstLevel.done, "первый слой не должен завершать generator").toBe(false)
    expect(firstLevel.value, "первый слой должен содержать Fuzzy и Axion с root wimp как parent").toEqual([
      { particle: expect.any(Fuzzy), parent: wimp, meta: {} },
      { particle: expect.any(Axion), parent: wimp, meta: {} },
    ])
    axion = firstLevel.value?.find((build) => build.particle instanceof Axion)?.particle
    expect(fuzzy, "на первом уровне должен материализоваться Fuzzy").toBeDefined()
    expect(axion, "на первом уровне должен материализоваться Axion").toBeDefined()
  })
  test("генерация второго уровня", () => {
    const secondLevel = generator.next()
    const childWimp = secondLevel.value?.find((build) => build.particle instanceof Wimp)?.particle

    expect(secondLevel.done, "второй слой не должен завершать generator").toBe(false)
    expect(secondLevel.value, "второй слой должен содержать дочерний Wimp с Axion как parent").toEqual([
      { particle: expect.any(Wimp), parent: axion!, meta: {} },
    ])
    expect(childWimp, "на втором уровне должен материализоваться дочерний Wimp").toBeDefined()
  })
  test("matter pipeline сохраняет стабильное состояние графа для одного meta", () => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()

    matterPipeline(wimp, ast)

    const particles = Array.from(dark$.particles.values())
    const fuzzy = particles.find((particle): particle is Fuzzy => particle instanceof Fuzzy)
    const axion = particles.find((particle): particle is Axion => particle instanceof Axion)
    const childWimp = particles.find((particle): particle is Wimp => particle instanceof Wimp && particle !== wimp)

    expect(fuzzy, "matterPipeline должен сохранить Fuzzy в store").toBeDefined()
    expect(axion, "matterPipeline должен сохранить Axion в store").toBeDefined()
    expect(childWimp, "matterPipeline должен сохранить дочерний Wimp в store").toBeDefined()

    expect(dark$.particles.size, "store должен содержать root и три materialized particle").toBe(4)
    expect(wimp.children, "root wimp должен ссылаться на Fuzzy и Axion").toEqual(new Set([fuzzy!.id, axion!.id]))
    expect(axion!.children, "Axion должен ссылаться на дочерний Wimp").toEqual(new Set([childWimp!.id]))
    expect(fuzzy!.children, "Fuzzy на этом fixture не должен иметь children").toEqual(new Set())

    expect(dark$.meta, "meta lookup должен содержать root и дочерний Wimp").toEqual(
      new Map([
        [wimp.id, src],
        [childWimp!.id, "zavx0z/git-error"],
      ]),
    )

    expect(dark$.parent.get(fuzzy!), "parent Fuzzy должен быть root wimp").toBe(wimp)
    expect(dark$.parent.get(axion!), "parent Axion должен быть root wimp").toBe(wimp)
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
