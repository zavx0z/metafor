import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../index"

describe("basic", () => {
  describe("простая пара тегов", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html }) => html`<div></div>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
        },
      ])
    })
  })

  describe("вложенность и соседние узлы", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(
        ({ html }) => html`
          <ul>
            <li>a</li>
            <li>b</li>
          </ul>
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "a",
                },
              ],
            },
            {
              tag: "li",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "b",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("void и self", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(
        ({ html }) => html`
          <div>
            <br />
            <img src="x" />
            <input disabled />
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
              tag: "br",
              type: "el",
            },
            {
              tag: "img",
              type: "el",
              string: {
                src: "x",
              },
            },
            {
              tag: "input",
              type: "el",
              boolean: {
                disabled: true,
              },
            },
          ],
        },
      ])
    })
  })
})
