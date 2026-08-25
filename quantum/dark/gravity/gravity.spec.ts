import { describe, expect, test } from "bun:test"
import type {Fields} from "@metafor/types/metafor/fields"
import type {Node} from "@zavx0z/template"
import { resolveContinuationSources } from "./gravity.ts"

type NodeMeta = Extract<Node, {type: "meta"}>

describe("resolveContinuationSources", () => {
  test("динамический `src` по необязательному `enum` раскрывается только по значениям `enum` без ветви `null`", () => {
    const node: NodeMeta = {
      type: "meta",
      tag: "meta-for",
      src: {
        data: "operation",
        expr: "owner/project-history-${_[0]}",
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
      "owner/project-history-switch",
      "owner/project-history-checkout",
      "owner/project-history-commit",
    ])
  })
})
