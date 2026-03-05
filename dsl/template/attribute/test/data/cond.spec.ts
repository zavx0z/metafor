import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("условные выражения в атрибутах", () => {
  describe("тернарный оператор с числом в качестве условия", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse<{ count: number }>(
        ({ html, fields }) => html`
          <div class="${10 > fields.count && fields.count < 3 ? "active" : "inactive"}">Content</div>
        `
      )
    })
    it("data", () => {
      expect(elements, "одна переменная в нескольких местах").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/fields/count",
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
    let elements: Node[]
    beforeAll(() => {
      elements = parse<{ isActive: boolean; status: "waiting" | "running"; item: string }>(
        ({ html, fields, mass }) => html`
          <div class="${mass.isActive === fields.isActive ? `${fields.item}-active-${fields.status}` : "inactive"}">
            Content
          </div>
        `
      )
    })
    it("data", () => {
      expect(elements, "тернарный оператор сравнения с динамическими результатами").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/mass/isActive", "/fields/isActive", "/fields/item", "/fields/status"],
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
