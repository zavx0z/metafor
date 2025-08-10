import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - статические атрибуты", () => {
  describe("простые статические атрибуты", () => {
    it("один статический атрибут", () => {
      const result = parseTemplate(`<div class="container">Content</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: "container",
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ] as const
      expect(result, "один статический атрибут").toEqual(expected)
    })

    it("несколько статических атрибутов", () => {
      const result = parseTemplate(`<button type="submit" class="btn" disabled>Submit</button>`)
      const expected: Schema = [
        {
          tag: "button",
          type: "el",
          attrs: {
            type: "submit",
            class: "btn",
            disabled: "",
          },
          child: [
            {
              type: "text",
              value: "Submit",
            },
          ],
        },
      ] as const
      expect(result, "несколько статических атрибутов").toEqual(expected)
    })

    it("атрибуты с дефисами", () => {
      const result = parseTemplate(`<div data-test-id="test" aria-label="description">Content</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            "data-test-id": "test",
            "aria-label": "description",
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ] as const
      expect(result, "атрибуты с дефисами").toEqual(expected)
    })
  })

  describe("самозакрывающиеся теги", () => {
    it("input с атрибутами", () => {
      const result = parseTemplate(`<input type="text" placeholder="Enter name" required />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            type: "text",
            placeholder: "Enter name",
            required: "",
          },
        },
      ] as const
      expect(result, "input с атрибутами").toEqual(expected)
    })

    it("img с атрибутами", () => {
      const result = parseTemplate(`<img src="image.jpg" alt="Description" width="100" height="50" />`)
      const expected: Schema = [
        {
          tag: "img",
          type: "el",
          attrs: {
            src: "image.jpg",
            alt: "Description",
            width: "100",
            height: "50",
          },
        },
      ] as const
      expect(result, "img с атрибутами").toEqual(expected)
    })
  })

  describe("пустые элементы", () => {
    it("элемент без атрибутов", () => {
      const result = parseTemplate(`<div>Content</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ] as const
      expect(result, "элемент без атрибутов").toEqual(expected)
    })

    it("самозакрывающийся элемент без атрибутов", () => {
      const result = parseTemplate(`<br />`)
      const expected: Schema = [
        {
          tag: "br",
          type: "el",
        },
      ] as const
      expect(result, "самозакрывающийся элемент без атрибутов").toEqual(expected)
    })
  })

  describe("вложенные элементы со статическими атрибутами", () => {
    it("вложенные элементы", () => {
      const result = parseTemplate(`
        <div class="container">
          <header class="header">
            <h1 class="title">Title</h1>
          </header>
          <main class="main">
            <p class="text">Content</p>
          </main>
        </div>
      `)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: "container",
          },
          child: [
            {
              tag: "header",
              type: "el",
              attrs: {
                class: "header",
              },
              child: [
                {
                  tag: "h1",
                  type: "el",
                  attrs: {
                    class: "title",
                  },
                  child: [
                    {
                      type: "text",
                      value: "Title",
                    },
                  ],
                },
              ],
            },
            {
              tag: "main",
              type: "el",
              attrs: {
                class: "main",
              },
              child: [
                {
                  tag: "p",
                  type: "el",
                  attrs: {
                    class: "text",
                  },
                  child: [
                    {
                      type: "text",
                      value: "Content",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as const
      expect(result, "вложенные элементы").toEqual(expected)
    })
  })

  describe("edge cases статических атрибутов", () => {
    it("атрибуты с кавычками внутри", () => {
      const result = parseTemplate(`<div title="This is a 'quoted' text">Content</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            title: "This is a 'quoted' text",
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ] as const
      expect(result, "атрибуты с кавычками внутри").toEqual(expected)
    })

    it("атрибуты с двойными кавычками", () => {
      const result = parseTemplate(`<div title='This is a "quoted" text'>Content</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            title: 'This is a "quoted" text',
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ] as const
      expect(result, "атрибуты с двойными кавычками").toEqual(expected)
    })

    it("атрибуты с пробелами", () => {
      const result = parseTemplate(`<div class="  spaced  class  ">Content</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: "  spaced  class  ",
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ] as const
      expect(result, "атрибуты с пробелами").toEqual(expected)
    })

    it("некавыченные статические атрибуты на обычном элементе", () => {
      const result = parseTemplate(`<div id=root class=box data-a=1></div>`)
      const expected: Schema = [{ tag: "div", type: "el", attrs: { id: "root", class: "box", "data-a": "1" } }] as const
      expect(result, "атрибуты без кавычек должны парситься").toEqual(expected)
    })

    it("некавыченные статические атрибуты в самозакрывающемся теге", () => {
      const result = parseTemplate(`<input type=text disabled />`)
      const expected: Schema = [{ tag: "input", type: "el", attrs: { type: "text", disabled: "" } }] as const
      expect(result, "самозакрывающийся с некавыч. атрибутами").toEqual(expected)
    })
  })
})
