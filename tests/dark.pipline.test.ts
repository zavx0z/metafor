import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { Address } from "@dark/types/dark"

import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"
import type { MetaAST } from "../metafor/ast/ast.t"
import { dark$, gravity$ } from "../dark"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
})
const address = "zavx0z/git"
describe("dark - корневой мета", () => {
  let ast: MetaAST

  describe("загрузка", () => {
    test("проверка мета в хранилище", () => {
      expect(gravity$.getFragment(address), "мета не должен при инициализации быть в хранилище").toBeUndefined()
    })
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
            tag: "meta-for",
            type: "meta",
            string: {
              src: {
                data: "/value/operation",
                expr: "zavx0z/git-${_[0]}",
              },
              context: {
                data: ["/value/operation", "/value/args", "/operation", "/args"],
                expr: "${{ _[2]: _[0], _[3]: _[1] }}",
              },
            },
          },
          {
            type: "log",
            data: "/state",
            expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
            child: [
              {
                tag: "meta-for",
                type: "meta",
                string: {
                  src: "zavx0z/git-error",
                  context: {
                    data: ["/value/error", "/message"],
                    expr: "${{ _[1]: _[0] }}",
                  },
                },
              },
            ],
          },
        ],
        mass: {},
      })
    })
    test("сохранение мета в хранилище", () => {
      dark$.meta.set(address, ast)
      expect(dark$.meta.get(address), "мета должна быть в Map хранилищa").toEqual(ast)
    })
  })
})
