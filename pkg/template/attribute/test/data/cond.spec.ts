import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("условные выражения в атрибутах", () => {
  describe("тернарный оператор с числом в качестве условия", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<{ count: { type: "number"; required: true; default: 0 } }>(
        ({ html, value }) => html`
          <div class="${10 > value.count && value.count < 3 ? "active" : "inactive"}">Content</div>
        `,
      )
    })
    it("data", () => {
      expect(elements, "одна переменная в нескольких местах").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/value/count",
              expr: '${10 > _[0] && _[0] < 3 ? "active" : "inactive"}',
            },
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ])
    })
  })
  describe("тернарный оператор сравнения через === с динамическими результатами", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<
        {
          isActive: { type: "boolean"; required: true; default: false }
          item: { type: "string"; required: true; default: "" }
          status: { type: "string"; required: true; default: "" }
        },
        { isActive: boolean }
      >(
        ({ html, value, mass }) => html`
          <div class="${mass.isActive === value.isActive ? `${value.item}-active-${value.status}` : "inactive"}">
            Content
          </div>
        `,
      )
    })
    it("data", () => {
      expect(elements, "тернарный оператор сравнения с динамическими результатами").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/mass/isActive", "/value/isActive", "/value/item", "/value/status"],
              expr: '${_[0] === _[1] ? `${_[2]}-active-${_[3]}` : "inactive"}',
            },
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ])
    })
  })
})
