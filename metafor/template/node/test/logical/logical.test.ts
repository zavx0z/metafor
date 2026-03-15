import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("логические операторы", () => {
  describe("простой логический оператор &&", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ error: { type: "string" } }>(
        ({ html, value }) => html` <div>${value.error && html`<span class="error">${value.error}</span>`}</div> `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "log",
              data: "/value/error",
              child: [
                {
                  tag: "span",
                  type: "el",
                  string: {
                    class: "error",
                  },
                  child: [
                    {
                      type: "text",
                      data: "/value/error",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("логический оператор с вложенными элементами", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{}, { user: { name: string; avatar: string } }>(
        ({ html, mass }) => html`
          <div>
            ${mass.user &&
            html`
              <div class="user">
                <img src="${mass.user.avatar}" alt="${mass.user.name}" />
                <span>${mass.user.name}</span>
              </div>
            `}
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
              type: "log",
              data: "/mass/user",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "user",
                  },
                  child: [
                    {
                      tag: "img",
                      type: "el",
                      string: {
                        src: {
                          data: "/mass/user/avatar",
                        },
                        alt: {
                          data: "/mass/user/name",
                        },
                      },
                    },
                    {
                      tag: "span",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          data: "/mass/user/name",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("логический оператор с булевым условием", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ isVisible: { type: "boolean" }; message: { type: "string" } }>(
        ({ html, value }) => html` <div>${value.isVisible && html`<p>${value.message}</p>`}</div> `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "log",
              data: "/value/isVisible",
              child: [
                {
                  tag: "p",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "/value/message",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("логический оператор с самозакрывающимся тегом", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ hasError: { type: "boolean" } }>(
        ({ html, value }) => html` <div>${value.hasError && html`<br />`}</div> `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "log",
              data: "/value/hasError",
              child: [
                {
                  tag: "br",
                  type: "el",
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
