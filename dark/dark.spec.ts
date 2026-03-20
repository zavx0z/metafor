import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import type { DarkParticle } from "@dark/types"
import type { AxionSeed, FuzzySeed, ParticleSeed } from "@dark/gravity"

import { Axion, Fuzzy, Wimp } from "@dark/part"
import { materializeParticleLayer, strong$ } from "@dark/strong"
import { particleGenerator } from "@dark/gravity"
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
  let firstLayer: ParticleSeed[] | undefined
  let fuzzySeed: FuzzySeed | undefined
  let axionSeed: AxionSeed | undefined
  test("генерация первого уровня metadata", () => {
    const firstLevel = generator.next()

    expect(firstLevel.done, "первый слой не должен завершать generator").toBe(false)
    expect(firstLevel.value, "первый слой должен содержать Fuzzy и Axion с root wimp как parent").toEqual([
      { kind: "fuzzy", parent: wimp, meta: {} },
      {
        kind: "axion",
        basis: "/state",
        expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
        parent: wimp,
        meta: {},
      },
    ])
    firstLayer = firstLevel.value
    fuzzySeed = firstLevel.value?.find((seed): seed is FuzzySeed => seed.kind === "fuzzy")
    axionSeed = firstLevel.value?.find((seed): seed is AxionSeed => seed.kind === "axion")
    expect(fuzzySeed, "на первом уровне должен появиться Fuzzy seed").toBeDefined()
    expect(axionSeed, "на первом уровне должен появиться Axion seed").toBeDefined()
  })
  let materialized: Map<ParticleSeed, DarkParticle>
  let fuzzy: Fuzzy | undefined
  let axion: Axion | undefined
  test("materialization первого уровня", () => {
    if (!firstLayer) throw new Error("first layer is undefined")

    materialized = new Map()
    const firstBuilds = materializeParticleLayer(firstLayer, materialized)

    expect(firstBuilds, "strong должен материализовать первый metadata-слой в Fuzzy и Axion").toEqual([
      { seed: fuzzySeed!, particle: expect.any(Fuzzy), parent: wimp, meta: {} },
      { seed: axionSeed!, particle: expect.any(Axion), parent: wimp, meta: {} },
    ])

    fuzzy = firstBuilds.find(
      (build): build is (typeof firstBuilds)[number] & { particle: Fuzzy } => build.particle instanceof Fuzzy,
    )?.particle
    axion = firstBuilds.find(
      (build): build is (typeof firstBuilds)[number] & { particle: Axion } => build.particle instanceof Axion,
    )?.particle
    expect(fuzzy, "после materialization первого слоя должен появиться Fuzzy instance").toBeDefined()
    expect(fuzzy?.value, "Fuzzy без выбранного enum значения должен быть пустым").toBeNull()
    expect(axion, "после materialization первого слоя должен появиться Axion instance").toBeDefined()
  })
  let secondLayer: ParticleSeed[] | undefined
  test("генерация второго уровня metadata", () => {
    const secondLevel = generator.next()
    const values = ref.fields.operation?.values ?? []

    expect(secondLevel.done, "второй слой не должен завершать generator").toBe(false)
    expect(secondLevel.value, "второй слой должен раскрывать все static Wimp из Fuzzy и child ветку Axion").toEqual([
      ...values.map((value) => ({
        kind: "wimp",
        src: `zavx0z/git-${value}`,
        fields: {
          data: ["/value/operation", "/value/args"],
          expr: "{ operation: _[0], args: _[1] }",
        },
        parent: fuzzySeed!,
        meta: {},
      })),
      {
        kind: "wimp",
        src: "zavx0z/git-error",
        fields: {
          data: "/value/error",
          expr: "{ message: _[0] }",
        },
        parent: axionSeed!,
        meta: {},
      },
    ])
    secondLayer = secondLevel.value
  })
  test("materialization второго уровня", () => {
    if (!secondLayer) throw new Error("second layer is undefined")

    const secondBuilds = materializeParticleLayer(secondLayer, materialized)
    const values = ref.fields.operation?.values ?? []
    const wimps = secondBuilds
      .filter((build): build is (typeof secondBuilds)[number] & { particle: Wimp } => build.particle instanceof Wimp)
      .filter((build) => build.parent === fuzzy)
      .map((build) => build.particle)
    const childWimp = secondBuilds.find(
      (build): build is (typeof secondBuilds)[number] & { particle: Wimp } =>
        build.particle instanceof Wimp && build.parent === axion,
    )?.particle

    expect(secondBuilds, "strong должен materialize второй metadata-слой в Wimp instances").toEqual([
      ...values.map(() => ({
        seed: expect.objectContaining({ kind: "wimp" }),
        particle: expect.any(Wimp),
        parent: fuzzy!,
        meta: {},
      })),
      {
        seed: expect.objectContaining({ kind: "wimp", src: "zavx0z/git-error" }),
        particle: expect.any(Wimp),
        parent: axion!,
        meta: {},
      },
    ])
    expect(
      wimps.map((wimp) => wimp.src),
      "Fuzzy должен раскрывать все static Wimp из enum values",
    ).toEqual(values.map((value) => `zavx0z/git-${value}`))
    expect(childWimp, "на втором уровне должен материализоваться дочерний Wimp для Axion").toBeDefined()
    expect(childWimp?.src, "дочерний Wimp должен сохранять статический src из child meta").toBe("zavx0z/git-error")
  })
  test("завершение генератора", () => {
    const end = generator.next()

    expect(end.done, "generator должен завершиться после второго уровня").toBe(true)
    expect(end.value, "после завершения generator не должен возвращать следующий слой").toBeUndefined()
  })
})
