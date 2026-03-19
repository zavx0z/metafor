import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"

import type { Address } from "@dark/types/dark"
import type { FieldDefinitionJson, MetaAST } from "@metafor/ast"

import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture/hub"
import { installDeterministicIds } from "fixture/id"
import { loadMetaAST } from "../dark/load"
import type { DarkStore, FieldID, Wimp, WimpID } from "@dark/types"
import type { ValueDynamic, ValueVariable } from "@metafor/dsl"
import { strong$ } from "@dark/strong/store"

const hub = new HubFixture("./github/")
beforeAll(async () => await hub.setup())
afterAll(async () => await hub.teardown())

const dark$: DarkStore = {
  meta: new Map(),
  particles: new Map(),
  parent: new Map(),
}

const address = "zavx0z/git"
describe("dark - корневой мета", () => {
  let ast: MetaAST

  beforeEach(() => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent.clear()
    strong$.fields.clear()
    strong$.keys.clear()
    strong$.wimp.clear()
  })

  describe("загрузка", () => {
    test("загрузка мета ast", async () => {
      ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
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
    let wimpId: WimpID
    test("сохранение связи wimp/meta", () => {
      wimpId = crypto.randomUUID()
      dark$.meta.set(address, wimpId)
      expect(dark$.meta).toEqual(new Map([[address, wimpId]]))
    })
    test("сохранение полей в strong$", () => {
      const restore = installDeterministicIds(["operation-id", "error-id", "command-id", "args-id"])

      try {
        const fieldIds: string[] = []
        for (const [key, value] of Object.entries(ast.fields))
          fieldIds.push(strong$.push(wimpId, key as FieldID, value))

        expect(strong$.fields).toEqual(new Map(Object.entries(ast.fields)))
        expect(strong$.keys).toEqual(
          new Map([
            ["operation-id", "operation"],
            ["error-id", "error"],
            ["command-id", "command"],
            ["args-id", "args"],
          ]),
        )
        expect(strong$.wimp).toEqual(new Map([[wimpId, new Set(fieldIds)]]))
      } finally {
        restore()
      }
    })
    test("сохранение мета в хранилище", () => {
      const wimp: Wimp = {
        id: wimpId,
        kind: "wimp",
        src: address,
        children: [],
      }
      if (ast.mass && Object.keys(ast.mass).length > 0) wimp.mass = ast.mass

      dark$.meta.set(address, wimpId)
      dark$.particles.set(wimp.id, wimp)
      expect(dark$).toEqual({
        meta: new Map([["zavx0z/git", wimpId]]),
        particles: new Map([
          [
            wimpId,
            {
              id: wimpId,
              kind: "wimp",
              src: "zavx0z/git",
              children: [],
            },
          ],
        ]),
        parent: new Map(),
      })
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
function createFuzzy(src: ValueDynamic | ValueVariable, fields: Record<FieldID, FieldDefinitionJson>) {
  if (typeof src.data === "string") {
    const field = fields[src.data.split("/").at(-1) as FieldID]
    console.log(field)
  }
}
