import { describe, expect, test } from "bun:test"
import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"
import { resolveContinuationSources } from "./gravity.ts"

describe("resolveContinuationSources", () => {
  test("optional enum dynamic src раскрывается только по enum values без null-ветви", () => {
    const node: NodeMeta = {
      type: "meta",
      tag: "meta-for",
      src: {
        data: "/value/operation",
        expr: "zavx0z/git-history-${_[0]}",
      },
    }

    const fields: FieldsAST = {
      operation: {
        type: "enum<string>",
        label: "Тип операции",
        values: ["switch", "checkout", "commit"],
      },
    }

    expect(resolveContinuationSources(node, fields)).toEqual([
      "zavx0z/git-history-switch",
      "zavx0z/git-history-checkout",
      "zavx0z/git-history-commit",
    ])
  })
})
