import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../index.ts"

describe("text-formatting", () => {
  describe("форматирует текст по стандартам HTML (схлопывание пробельных символов)", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        { name: { type: "string" }; title: { type: "string" } },
        { items: { title: { type: "string" } }[] }
      >(
        ({ html, value, mass }) => html`
          <div>
            <p>Hello World</p>
            <span>${value.name} - ${value.title}</span>
            <span>${value.name} - ${mass.items.map((item) => item.title).join(", ")}</span>
            <div>Welcome to our site!</div>
            <p>${value.name} is ${value.title}</p>
          </div>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "p",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Hello World",
                },
              ],
            },
            {
              tag: "span",
              type: "el",
              child: [
                {
                  type: "text",
                  data: ["/value/name", "/value/title"],
                  expr: "${_[0]} - ${_[1]}",
                },
              ],
            },
            {
              tag: "span",
              type: "el",
              child: [
                {
                  type: "text",
                  data: "/value/name",
                  expr: "${_[0]} - ${_[0]}",
                },
              ],
            },
            {
              tag: "div",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Welcome to our site!",
                },
              ],
            },
            {
              tag: "p",
              type: "el",
              child: [
                {
                  type: "text",
                  data: ["/value/name", "/value/title"],
                  expr: "${_[0]} is ${_[1]}",
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
