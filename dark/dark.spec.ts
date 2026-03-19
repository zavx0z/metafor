import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import reference from "../github/zavx0z/git/meta.json"
import { HubFixture, installDeterministicIds } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"

import { Wimp } from "@dark/part"
import { strong$, particleGenerator } from "@dark/strong"
import { loadMetaAST } from "../dark/load"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")
beforeAll(async () => await hub.setup())
afterAll(async () => await hub.teardown())

const src = "zavx0z/git"
const ref = reference as MetaAST

describe("dark - корневой мета", () => {
  beforeAll(() => {
    dark$.particles.clear()
    strong$.fields.clear()
    strong$.keys.clear()
    strong$.wimp.clear()
  })

  describe("init", () => {
    let ast: MetaAST

    test("load", async () => {
      ast = (await loadMetaAST("zavx0z/git" as SRC)) as MetaAST
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

    let wimp: Wimp

    test("create wimp", () => {
      wimp = new Wimp(src)

      dark$.particles.set(wimp.id, wimp)
      if (ref.mass && Object.keys(ref.mass).length > 0) wimp.mass = ref.mass

      expect(dark$.particles).toEqual(new Map([[wimp.id, wimp]]))
      expect(dark$.parent).toBeInstanceOf(WeakMap)
    })

    test("create ast generator", () => {
      if (!ref.matter) throw new Error("matter is undefined")

      expect(Array.from(particleGenerator(ref.matter), ({ type }) => type)).toEqual(["meta", "log", "meta"])
    })

    test("create dynamic particles", () => {
      if (!ref.matter) throw new Error("matter is undefined")

      for (const node of particleGenerator(ref.matter)) {
        switch (node.type) {
          case "meta":
            if (typeof node.src === "object") {
              console.log("meta ", node)
            }
            break
          case "log":
            console.log("log ", node)
            break
          case "map":
            console.log("map ", node)
            break
          default:
            console.log("!!!!! ", node.type)
            break
        }
      }
    })
    test("сохранение полей в strong$", () => {
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
