import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("логические операторы", () => {
  describe("простой логический оператор &&", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ error: string }>(
        ({ html, fields }) => html` <div>${fields.error && html`<span class="error">${fields.error}</span>`}</div> `
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
              data: "/fields/error",
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
                      data: "/fields/error",
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
    let elements: Node[]

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
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ isVisible: boolean; message: string }>(
        ({ html, fields }) => html` <div>${fields.isVisible && html`<p>${fields.message}</p>`}</div> `
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
              data: "/fields/isVisible",
              child: [
                {
                  tag: "p",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "/fields/message",
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
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ hasError: boolean }>(
        ({ html, fields }) => html` <div>${fields.hasError && html`<br />`}</div> `
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
              data: "/fields/hasError",
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
