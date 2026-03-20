import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { HubFixture } from "fixture"
import reference from "../github/zavx0z/git/meta.json"

import { loadMetaAST } from "./load.ts"

const hub = new HubFixture("./github/")

describe("loadMetaAST", () => {
  beforeAll(async () => await hub.setup())
  afterAll(async () => await hub.teardown())

  test("загружает MetaAST из файла", async () => {
    const ast = await loadMetaAST("zavx0z/git")

    expect(ast, "loadMetaAST должен вернуть тот же MetaAST, что и ref").toEqual(reference as MetaAST)
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
})
