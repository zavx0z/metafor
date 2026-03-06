import { it, describe, expect } from "bun:test"
import { enrichWithData } from "../../parser"
import type { PartsAttr } from "../../node/index.t"

describe("event", () => {
  it("update в функции", () => {
    const attributes = [
      {
        tag: "meta-${mass.tag}",
        type: "meta",
        event: {
          onclick: "() => update({ selected: mass.id })",
        },
      },
    ] as PartsAttr

    const data = enrichWithData(attributes)
    expect(data).toEqual([
      {
        tag: {
          data: "/mass/tag",
          expr: "meta-${_[0]}",
        },
        type: "meta",
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
