import { describe, it, expect } from "bun:test"
import { TemplateParser, parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("TemplateParser", () => {
  describe("основные функции", () => {
    it("parseTemplate функция работает", () => {
      const result = parseTemplate(`<div>Hello</div>`)
      expect(result, "parseTemplate возвращает схему").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Hello",
            },
          ],
        },
      ])
    })

    it("TemplateParser класс работает", () => {
      const parser = new TemplateParser()
      const result = parser.parseHtmlToSchema(`<span>World</span>`)
      expect(result, "класс парсера возвращает схему").toEqual([
        {
          tag: "span",
          type: "el",
          child: [
            {
              type: "text",
              value: "World",
            },
          ],
        },
      ])
    })
  })

  describe("парсинг элементов", () => {
    it("простой HTML элемент", () => {
      const result = parseTemplate(`<div>Hello, world!</div>`)
      expect(result, "простой div с текстом").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Hello, world!",
            },
          ],
        },
      ])
    })

    it("элемент с атрибутами", () => {
      const result = parseTemplate(`<div class="container" id="main">Content</div>`)
      expect(result, "div с атрибутами").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {
            class: "container",
            id: "main",
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

    it("вложенные элементы", () => {
      const result = parseTemplate(`<div>
        <h1>Title</h1>
        <p>Description</p>
      </div>`)
      expect(result, "вложенные элементы").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "h1",
              type: "el",

              child: [
                {
                  type: "text",
                  value: "Title",
                },
              ],
            },
            {
              tag: "p",
              type: "el",

              child: [
                {
                  type: "text",
                  value: "Description",
                },
              ],
            },
          ],
        },
      ])
    })

    it("пустые элементы", () => {
      const result = parseTemplate(`<div></div><span></span>`)
      expect(result, "пустые элементы").toEqual([
        {
          tag: "div",
          type: "el",
        },
        {
          tag: "span",
          type: "el",
        },
      ])
    })
  })

  describe("интерполяции", () => {
    it("простая интерполяция", () => {
      const result = parseTemplate(`<div>\${context.name}</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: {
                src: "context",
                key: "name",
              },
            },
          ],
        },
      ]
      expect(result, "простая интерполяция").toEqual(expected)
    })

    it("смешанный текст с интерполяцией", () => {
      const result = parseTemplate(`<div>Total: \${context.count}</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Total:",
            },
            {
              type: "text",
              value: {
                src: "context",
                key: "count",
              },
            },
          ],
        },
      ]
      expect(result, "смешанный текст").toEqual(expected)
    })
  })

  describe("edge cases", () => {
    it("самозакрывающиеся теги", () => {
      const result = parseTemplate(`<div><img src="image.jpg" alt="Image" /><br /></div>`)
      expect(result, "самозакрывающиеся теги").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "img",
              type: "el",
              attrs: {
                src: "image.jpg",
                alt: "Image",
              },
            },
            {
              tag: "br",
              type: "el",
            },
          ],
        },
      ])
    })

    it("атрибуты с дефисами", () => {
      const result = parseTemplate(`<div data-test="value" aria-label="test">Content</div>`)
      expect(result, "атрибуты с дефисами").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {
            "data-test": "value",
            "aria-label": "test",
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

    it("множественные корневые элементы", () => {
      const result = parseTemplate(`<header>Header</header><main>Main</main>`)
      expect(result, "несколько корневых элементов").toEqual([
        {
          tag: "header",
          type: "el",

          child: [
            {
              type: "text",
              value: "Header",
            },
          ],
        },
        {
          tag: "main",
          type: "el",

          child: [
            {
              type: "text",
              value: "Main",
            },
          ],
        },
      ])
    })
  })
})
