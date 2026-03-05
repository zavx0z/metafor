import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../index"

describe("text-formatting", () => {
  describe("форматирует текст по стандартам HTML (схлопывание пробельных символов)", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ name: string; title: string }, { items: { title: string }[] }>(
        ({ html, fields, mass }) => html`
          <div>
            <p>Hello World</p>
            <span>${fields.name} - ${fields.title}</span>
            <span>${fields.name} - ${mass.items.map((item) => item.title).join(", ")}</span>
            <div>Welcome to our site!</div>
            <p>${fields.name} is ${fields.title}</p>
          </div>
        `
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
                  data: ["/fields/name", "/fields/title"],
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
                  data: "/fields/name",
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
                  data: ["/fields/name", "/fields/title"],
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
