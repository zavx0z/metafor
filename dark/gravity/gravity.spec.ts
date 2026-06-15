import { describe, expect, test } from "bun:test"
import type { Fields, NodeMeta } from "../../index.ts"
import { resolveContinuationSources } from "./gravity.ts"

describe("resolveContinuationSources", () => {
  test("динамический `src` по необязательному `enum` раскрывается только по значениям `enum` без ветви `null`", () => {
    const node: NodeMeta = {
      type: "meta",
      tag: "meta-for",
      src: {
        data: "operation",
        expr: "zavx0z/git-history-${_[0]}",
      },
    }

    const fields: Fields = {
      operation: {
        type: "enum",
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
