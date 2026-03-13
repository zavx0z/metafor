import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Address } from "./dark.t"
import { HubFixture } from "../fixture/hub"
import * as dark from "./dark"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
  dark$.reset()
})

describe("dark.matter", () => {
  test("загружает meta и создаёт атомы", async () => {
    await dark.matter("zavx0z/git" as Address)

    const snapshot = dark$.snapshot()

    // Проверяем структуру snapshot
    expect(snapshot).toMatchObject({
      meta: new Map([
        [
          "zavx0z/git",
          {
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
                "выполнение": {
                  operation: {
                    null: false,
                  },
                },
                "ошибка": {
                  error: {
                    null: false,
                  },
                },
              },
              "выполнение": {
                "получение команды": {
                  operation: null,
                },
              },
              "ошибка": {
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
                  src: "({ update, data }) => update(data, \"s\")",
                },
                error: {
                  src: "({ update, error }) => update({ error: error.message }, \"e\")",
                  write: ["error"],
                },
              },
            },
            gravity: [
              {
                type: "log",
                data: "/value/operation",
                child: [
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
                ],
              },
              {
                type: "log",
                data: "/value/error",
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
          },
        ],
        [
          "zavx0z/git-error",
          {
            name: "git-error",
            fields: {
              error: {
                type: "string",
                label: "Ошибка",
              },
            },
            superposition: {},
            processes: {},
            gravity: [
              {
                type: "log",
                data: "/value/error",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: "/value/error",
                      },
                    ],
                    string: {
                      class: "error",
                    },
                  },
                ],
              },
            ],
            mass: {},
          },
        ],
      ]),
      atom: new Map([
        [
          expect.any(String),
          {
            uuid: expect.any(String),
            meta: "zavx0z/git",
            path: "0",
          },
        ],
        [
          expect.any(String),
          {
            uuid: expect.any(String),
            meta: "zavx0z/git-error",
            path: expect.stringMatching(/^0\/\d+$/),
          },
        ],
      ]),
    })
  })
})
