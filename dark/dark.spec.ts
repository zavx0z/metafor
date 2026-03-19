import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import type { FieldsAST, MetaAST } from "@metafor/ast"

import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture/hub"
import { installDeterministicIds } from "fixture/id"
import { loadMetaAST } from "../dark/load"
import type { ValueDynamic, ValueVariable, SRC } from "@metafor/dsl"
import { strong$ } from "@dark/strong/store"
import type { DarkStore, WimpID } from "@dark/types"
import { Wimp } from "./part/Wimp"

const hub = new HubFixture("./github/")
beforeAll(async () => await hub.setup())
afterAll(async () => await hub.teardown())

const dark$: DarkStore = {
  particles: new Map(),
  parent: new Map(),
}

const src = "zavx0z/git"
describe("dark - корневой мета", () => {
  let ast: MetaAST

  beforeAll(() => {
    dark$.particles.clear()
    dark$.parent.clear()
    strong$.fields.clear()
    strong$.keys.clear()
    strong$.wimp.clear()
  })

  describe("загрузка", () => {
    test("загрузка мета ast", async () => {
      ast = (await loadMetaAST("zavx0z/git" as SRC)) as MetaAST
      expect(ast).toEqual(reference as MetaAST)
      expect(ast).toEqual({
        name: "git",
        fields: {
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
        },
        superposition: {
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
        },
        processes: {
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
        },
        gravity: [
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
        ],
        mass: {},
      })
    })
    let wimp: Wimp
    test("сохранение мета в хранилище", () => {
      wimp = new Wimp({ src })
      dark$.particles.set(wimp.id, wimp)
      if (ast.mass && Object.keys(ast.mass).length > 0) wimp.mass = ast.mass

      expect(dark$).toEqual({ particles: new Map([[wimp.id, wimp]]), parent: new Map() })
    })
    test("сохранение полей в strong$", () => {
      const fieldIds = ["operation-id", "error-id", "command-id", "args-id"]
      const restore = installDeterministicIds(fieldIds)
      try {
        for (const [key, value] of Object.entries(ast.fields)) strong$.push(wimp.id, key, value)

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
    test("Обход gravity", () => {
      if (!ast.gravity) return
      for (const node of ast.gravity) {
        switch (node.type) {
          case "meta":
            if (typeof node.src === "object") {
              createFuzzy(node.src, ast.fields)
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
  })
})
function createFuzzy(src: ValueDynamic | ValueVariable, fields: FieldsAST) {
  if (typeof src.data === "string") {
    const field = fields[src.data.split("/").at(-1) as keyof FieldsAST]
    console.log(field)
  }
}
