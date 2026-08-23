import { it, describe, expect } from "bun:test"
import { enrichWithData } from "../../parser.ts"
import type { PartsAttr } from "@metafor/types/template/node/index"

describe("event", () => {
  it("update в функции", () => {
    const attributes = [
      {
        tag: "meta-for",
        type: "meta",
        src: "test/component",
        event: {
          onclick: "() => update({ selected: mass.id })",
        },
      },
    ] as PartsAttr

    const data = enrichWithData(attributes)
    expect(data).toEqual([
      {
        tag: "meta-for",
        type: "meta",
        src: "test/component",
        event: {
          onclick: {
            data: "/mass/id",
            expr: "() => update({ selected: _[0] })",
            upd: "selected",
          },
        },
      },
    ])
  })
})
