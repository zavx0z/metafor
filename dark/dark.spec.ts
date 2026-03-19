import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import reference from "../github/zavx0z/git/meta.json"
import { HubFixture, installDeterministicIds } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import { parse } from "@metafor/template"

import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"
import { strong$ } from "@dark/strong"
import { matterPipeline, particleGenerator } from "@dark/gravity"
import { loadMetaAST } from "../dark/load"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")
beforeAll(async () => await hub.setup())
afterAll(async () => await hub.teardown())

const src = "zavx0z/git"
const ref = reference as MetaAST

describe("dark - корневой мета", () => {
  beforeEach(() => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()
    strong$.fields.clear()
    strong$.keys.clear()
    strong$.wimp.clear()
  })

  describe("init", () => {
    test("load", async () => {
      const ast = (await loadMetaAST("zavx0z/git" as SRC)) as MetaAST
      expect(ast).toEqual(ref)
      expect(Object.keys(ast).sort()).toEqual(["fields", "mass", "matter", "name", "processes", "superposition"])
      expect(ast.name).toBe("git")
      expect(ast.fields).toEqual({
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
      expect(ast.superposition).toEqual({
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
      expect(ast.processes).toEqual({
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
      expect(ast.matter).toEqual([
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
      expect(ast.mass).toEqual({})
    })

    test("create wimp", () => {
      const wimp = new Wimp(src)

      dark$.particles.set(wimp.id, wimp)
      dark$.meta.set(wimp.id, wimp.src)
      if (ref.mass && Object.keys(ref.mass).length > 0) wimp.mass = ref.mass

      expect(dark$.particles).toEqual(new Map([[wimp.id, wimp]]))
      expect(dark$.meta).toEqual(new Map([[wimp.id, src]]))
      expect(dark$.parent).toBeInstanceOf(WeakMap)
    })

    test("create ast generator first level", () => {
      if (!ref.matter) throw new Error("matter is undefined")

      const wimp = new Wimp(src)
      const generator = particleGenerator(wimp, ref.matter, ref.fields)
      const firstLevel = generator.next()

      expect(firstLevel.done).toBe(false)
      expect(firstLevel.value).toEqual([
        { particle: expect.any(Fuzzy), parent: wimp, meta: {} },
        { particle: expect.any(Axion), parent: wimp, meta: {} },
      ])

      const secondLevel = generator.next()
      const axionBuild = firstLevel.value?.find((build) => build.particle instanceof Axion)

      expect(secondLevel.done).toBe(false)
      expect(axionBuild).toBeDefined()
      expect(secondLevel.value).toEqual([
        { particle: expect.any(Wimp), parent: axionBuild!.particle, meta: {} },
      ])
    })

    test("matter pipeline stores stable graph state for one meta", () => {
      const root = new Wimp(src)

      matterPipeline(root, ref)

      const particles = Array.from(dark$.particles.values())
      const fuzzy = particles.find((particle): particle is Fuzzy => particle instanceof Fuzzy)
      const axion = particles.find((particle): particle is Axion => particle instanceof Axion)
      const childWimp = particles.find((particle): particle is Wimp => particle instanceof Wimp && particle !== root)

      expect(fuzzy).toBeDefined()
      expect(axion).toBeDefined()
      expect(childWimp).toBeDefined()

      expect(dark$.particles.size).toBe(4)
      expect(root.children).toEqual(new Set([fuzzy!.id, axion!.id]))
      expect(axion!.children).toEqual(new Set([childWimp!.id]))
      expect(fuzzy!.children).toEqual(new Set())

      expect(dark$.meta).toEqual(
        new Map([
          [root.id, src],
          [childWimp!.id, "zavx0z/git-error"],
        ]),
      )

      expect(dark$.parent.get(fuzzy!)).toBe(root)
      expect(dark$.parent.get(axion!)).toBe(root)
      expect(dark$.parent.get(childWimp!)).toBe(axion)
    })

    test("condition creates fuzzy particle", () => {
      const [node] = parse(({ html, value }) => {
        html`${value.mode === "admin" ? html`<meta-for src="zavx0z/git-admin"></meta-for>` : html`<meta-for src="zavx0z/git-user"></meta-for>`}`
      })
      const root = new Wimp(src)
      const firstLevel = particleGenerator(root, [node]).next()

      expect(firstLevel.done).toBe(false)
      expect(firstLevel.value).toHaveLength(1)
      expect(firstLevel.value?.[0]?.particle).toBeInstanceOf(Fuzzy)
      expect((firstLevel.value?.[0]?.particle as Fuzzy).basis).toBe("/value/mode")
    })

    test("map creates macho particle", () => {
      const [node] = parse<any, { items: string[] }>(({ html, value }) => {
        html`${value.items.map((item) => html`<meta-for src="zavx0z/git-item"></meta-for>`)}`
      })
      const root = new Wimp(src)
      const firstLevel = particleGenerator(root, [node]).next()

      expect(firstLevel.done).toBe(false)
      expect(firstLevel.value).toHaveLength(1)
      expect(firstLevel.value?.[0]?.particle).toBeInstanceOf(Macho)
      expect((firstLevel.value?.[0]?.particle as Macho).basis).toBe("/value/items")
    })
    test("сохранение полей в strong$", () => {
      const wimp = new Wimp(src)
      const fieldIds = ["operation-id", "error-id", "command-id", "args-id"]
      const restore = installDeterministicIds(fieldIds)
      try {
        for (const [key, value] of Object.entries(ref.fields)) strong$.push(wimp.id, key, value)

        expect({ fields: strong$.fields, keys: strong$.keys, wimp: strong$.wimp }).toEqual({
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
})
