import { it, describe, expect } from "bun:test"
import { enrichWithData } from "../../data"
import type { PartAttrs } from "../../attributes.t"

describe("event", () => {
  it("update в функции", () => {
    const attributes = [
      {
        tag: "meta-${core.tag}",
        type: "meta",
        event: {
          onclick: "() => update({ selected: core.id })",
        },
      },
    ] as PartAttrs

    const data = enrichWithData(attributes)
    expect(data).toEqual([
      {
        tag: {
          data: "/core/tag",
          expr: "meta-${0}",
        },
        type: "meta",
        event: {
          onclick: {
            data: "/core/id",
            expr: "() => update({ selected: ${0} })",
            upd: "selected",
          },
        },
      },
    ])
  })
})
