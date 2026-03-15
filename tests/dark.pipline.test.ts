import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { Address } from "@dark/types/dark"

import reference from "../github/zavx0z/git/meta.json"
import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"
import type { MetaAST } from "../metafor/ast/ast.t"
import { dark$, gravity$ } from "../dark"
import { compileLocalTopologyFragment, type LocalTopologyMetaLike } from "../metafor/dsl/metafor"

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
      expect(gravity$.fragments.get(address), "мета не должен при инициализации быть в хранилище").toBeUndefined()
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
    test("получение фрагмента", () => {
      let fragment = gravity$.fragments.get(address)
      if (!fragment) {
        fragment = compileLocalTopologyFragment(ast as LocalTopologyMetaLike)
        gravity$.fragments.set(address, fragment)
      }
      console.log(fragment)
      expect(fragment).toEqual({
        meta: "git",
        objects: {
          f0: {
            id: "f0",
            kind: "fuzzy",
            nodePath: "0",
            sourceNode: {
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
            selector: {
              kind: "enum",
              dataPath: "/value/operation",
              field: "operation",
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
              expr: "zavx0z/git-${_[0]}",
            },
          },
          w1: {
            id: "w1",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-start",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "start",
            },
          },
          w2: {
            id: "w2",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-work",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "work",
            },
          },
          w3: {
            id: "w3",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-examine",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "examine",
            },
          },
          w4: {
            id: "w4",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-history",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "history",
            },
          },
          w5: {
            id: "w5",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-collaborate",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "collaborate",
            },
          },
          w6: {
            id: "w6",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-worktree",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "worktree",
            },
          },
          w7: {
            id: "w7",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-stash",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "stash",
            },
          },
          w8: {
            id: "w8",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-submodule",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "submodule",
            },
          },
          w9: {
            id: "w9",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-config",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "config",
            },
          },
          w10: {
            id: "w10",
            kind: "wimp",
            nodePath: "0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-plumbing",
            srcMode: "enum",
            variant: {
              field: "operation",
              value: "plumbing",
            },
          },
          a11: {
            id: "a11",
            kind: "axion",
            nodePath: "1",
            sourceNode: {
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
            dataPaths: ["/state"],
            expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
          },
          w12: {
            id: "w12",
            kind: "wimp",
            nodePath: "1.0",
            sourceNode: {
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
            tag: "meta-for",
            src: "zavx0z/git-error",
            srcMode: "static",
          },
        },
        roots: ["p0", "p11"],
        placements: {
          p0: {
            id: "p0",
            objectId: "f0",
            address: "/f:0-src",
            relation: "root",
          },
          p1: {
            id: "p1",
            objectId: "w1",
            address: "/f:0-src/w:0-start",
            relation: "branch",
            parentId: "p0",
            branchValue: "start",
          },
          p2: {
            id: "p2",
            objectId: "w2",
            address: "/f:0-src/w:0-work",
            relation: "branch",
            parentId: "p0",
            branchValue: "work",
          },
          p3: {
            id: "p3",
            objectId: "w3",
            address: "/f:0-src/w:0-examine",
            relation: "branch",
            parentId: "p0",
            branchValue: "examine",
          },
          p4: {
            id: "p4",
            objectId: "w4",
            address: "/f:0-src/w:0-history",
            relation: "branch",
            parentId: "p0",
            branchValue: "history",
          },
          p5: {
            id: "p5",
            objectId: "w5",
            address: "/f:0-src/w:0-collaborate",
            relation: "branch",
            parentId: "p0",
            branchValue: "collaborate",
          },
          p6: {
            id: "p6",
            objectId: "w6",
            address: "/f:0-src/w:0-worktree",
            relation: "branch",
            parentId: "p0",
            branchValue: "worktree",
          },
          p7: {
            id: "p7",
            objectId: "w7",
            address: "/f:0-src/w:0-stash",
            relation: "branch",
            parentId: "p0",
            branchValue: "stash",
          },
          p8: {
            id: "p8",
            objectId: "w8",
            address: "/f:0-src/w:0-submodule",
            relation: "branch",
            parentId: "p0",
            branchValue: "submodule",
          },
          p9: {
            id: "p9",
            objectId: "w9",
            address: "/f:0-src/w:0-config",
            relation: "branch",
            parentId: "p0",
            branchValue: "config",
          },
          p10: {
            id: "p10",
            objectId: "w10",
            address: "/f:0-src/w:0-plumbing",
            relation: "branch",
            parentId: "p0",
            branchValue: "plumbing",
          },
          p11: {
            id: "p11",
            objectId: "a11",
            address: "/a:1",
            relation: "root",
          },
          p12: {
            id: "p12",
            objectId: "w12",
            address: "/a:1/w:1-0",
            relation: "contains",
            parentId: "p11",
          },
        },
        links: [
          {
            from: "p0",
            to: "p1",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p2",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p3",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p4",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p5",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p6",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p7",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p8",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p9",
            relation: "branch",
          },
          {
            from: "p0",
            to: "p10",
            relation: "branch",
          },
          {
            from: "p11",
            to: "p12",
            relation: "contains",
          },
        ],
        references: [
          {
            id: "r0",
            placementId: "p1",
            objectId: "w1",
            tag: "meta-for",
            src: "zavx0z/git-start",
            via: "enum",
            field: "operation",
            value: "start",
          },
          {
            id: "r1",
            placementId: "p2",
            objectId: "w2",
            tag: "meta-for",
            src: "zavx0z/git-work",
            via: "enum",
            field: "operation",
            value: "work",
          },
          {
            id: "r2",
            placementId: "p3",
            objectId: "w3",
            tag: "meta-for",
            src: "zavx0z/git-examine",
            via: "enum",
            field: "operation",
            value: "examine",
          },
          {
            id: "r3",
            placementId: "p4",
            objectId: "w4",
            tag: "meta-for",
            src: "zavx0z/git-history",
            via: "enum",
            field: "operation",
            value: "history",
          },
          {
            id: "r4",
            placementId: "p5",
            objectId: "w5",
            tag: "meta-for",
            src: "zavx0z/git-collaborate",
            via: "enum",
            field: "operation",
            value: "collaborate",
          },
          {
            id: "r5",
            placementId: "p6",
            objectId: "w6",
            tag: "meta-for",
            src: "zavx0z/git-worktree",
            via: "enum",
            field: "operation",
            value: "worktree",
          },
          {
            id: "r6",
            placementId: "p7",
            objectId: "w7",
            tag: "meta-for",
            src: "zavx0z/git-stash",
            via: "enum",
            field: "operation",
            value: "stash",
          },
          {
            id: "r7",
            placementId: "p8",
            objectId: "w8",
            tag: "meta-for",
            src: "zavx0z/git-submodule",
            via: "enum",
            field: "operation",
            value: "submodule",
          },
          {
            id: "r8",
            placementId: "p9",
            objectId: "w9",
            tag: "meta-for",
            src: "zavx0z/git-config",
            via: "enum",
            field: "operation",
            value: "config",
          },
          {
            id: "r9",
            placementId: "p10",
            objectId: "w10",
            tag: "meta-for",
            src: "zavx0z/git-plumbing",
            via: "enum",
            field: "operation",
            value: "plumbing",
          },
          {
            id: "r10",
            placementId: "p12",
            objectId: "w12",
            tag: "meta-for",
            src: "zavx0z/git-error",
            via: "static",
          },
        ],
        entanglementSeeds: [
          {
            placementId: "p0",
            objectId: "f0",
            kind: "fuzzy",
            address: "/f:0-src",
            dataPaths: ["/value/operation"],
            referenceIds: [],
          },
          {
            placementId: "p1",
            objectId: "w1",
            kind: "wimp",
            address: "/f:0-src/w:0-start",
            dataPaths: ["/value/operation"],
            referenceIds: ["r0"],
          },
          {
            placementId: "p2",
            objectId: "w2",
            kind: "wimp",
            address: "/f:0-src/w:0-work",
            dataPaths: ["/value/operation"],
            referenceIds: ["r1"],
          },
          {
            placementId: "p3",
            objectId: "w3",
            kind: "wimp",
            address: "/f:0-src/w:0-examine",
            dataPaths: ["/value/operation"],
            referenceIds: ["r2"],
          },
          {
            placementId: "p4",
            objectId: "w4",
            kind: "wimp",
            address: "/f:0-src/w:0-history",
            dataPaths: ["/value/operation"],
            referenceIds: ["r3"],
          },
          {
            placementId: "p5",
            objectId: "w5",
            kind: "wimp",
            address: "/f:0-src/w:0-collaborate",
            dataPaths: ["/value/operation"],
            referenceIds: ["r4"],
          },
          {
            placementId: "p6",
            objectId: "w6",
            kind: "wimp",
            address: "/f:0-src/w:0-worktree",
            dataPaths: ["/value/operation"],
            referenceIds: ["r5"],
          },
          {
            placementId: "p7",
            objectId: "w7",
            kind: "wimp",
            address: "/f:0-src/w:0-stash",
            dataPaths: ["/value/operation"],
            referenceIds: ["r6"],
          },
          {
            placementId: "p8",
            objectId: "w8",
            kind: "wimp",
            address: "/f:0-src/w:0-submodule",
            dataPaths: ["/value/operation"],
            referenceIds: ["r7"],
          },
          {
            placementId: "p9",
            objectId: "w9",
            kind: "wimp",
            address: "/f:0-src/w:0-config",
            dataPaths: ["/value/operation"],
            referenceIds: ["r8"],
          },
          {
            placementId: "p10",
            objectId: "w10",
            kind: "wimp",
            address: "/f:0-src/w:0-plumbing",
            dataPaths: ["/value/operation"],
            referenceIds: ["r9"],
          },
          {
            placementId: "p12",
            objectId: "w12",
            kind: "wimp",
            address: "/a:1/w:1-0",
            dataPaths: [],
            referenceIds: ["r10"],
          },
        ],
      })
    })
  })
})
