import { describe, it, expect } from "bun:test"
import { parseTemplate, parseHtmlToSchema } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - основные функции", () => {
  describe("простые элементы", () => {
    it("пустая строка", () => {
      const result = parseTemplate("")
      expect(result, "пустая строка").toEqual([])
    })

    it("простой элемент без атрибутов", () => {
      const result = parseTemplate("<div>Hello World</div>")
      
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Hello World",
            },
          ],
        },
      ]
      
      expect(result, "простой элемент без атрибутов").toEqual(expected)
    })

    it("элемент с атрибутами", () => {
      const result = parseTemplate(`<div class="container" id="main">Content</div>`)
      
      const expected: Schema = [
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
      ]
      
      expect(result, "элемент с атрибутами").toEqual(expected)
    })

    it("самозакрывающийся элемент", () => {
      const result = parseTemplate(`<img src="image.jpg" alt="Image" />`)
      
      const expected: Schema = [
        {
          tag: "img",
          type: "el",
          attrs: {
            src: "image.jpg",
            alt: "Image",
          },
        },
      ]
      
      expect(result, "самозакрывающийся элемент").toEqual(expected)
    })

    it("вложенные элементы", () => {
      const result = parseTemplate(`
        <div class="outer">
          <span class="inner">Text</span>
          <p>Paragraph</p>
        </div>
      `)
      
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: "outer",
          },
          child: [
            {
              tag: "span",
              type: "el",
              attrs: {
                class: "inner",
              },
              child: [
                {
                  type: "text",
                  value: "Text",
                },
              ],
            },
            {
              tag: "p",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Paragraph",
                },
              ],
            },
          ],
        },
      ]
      
      expect(result, "вложенные элементы").toEqual(expected)
    })
  })

  describe("интерполяции", () => {
    it("простая интерполяция из context", () => {
      const result = parseTemplate(`<p>\${context.message}</p>`)
      
      const expected: Schema = [
        {
          tag: "p",
          type: "el",
          child: [
            {
              type: "text",
              value: {
                src: "context",
                key: "message",
              },
            },
          ],
        },
      ]
      
      expect(result, "простая интерполяция из context").toEqual(expected)
    })

    it("интерполяция из core", () => {
      const result = parseTemplate(`<span>\${core.settings}</span>`)
      
      const expected: Schema = [
        {
          tag: "span",
          type: "el",
          child: [
            {
              type: "text",
              value: {
                src: "core",
                key: "settings",
              },
            },
          ],
        },
      ]
      
      expect(result, "интерполяция из core").toEqual(expected)
    })

    it("интерполяция в атрибуте", () => {
      const result = parseTemplate(`<div id="\${context.elementId}">Content</div>`)
      
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            id: {
              src: "context",
              key: "elementId",
            },
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ]
      
      expect(result, "интерполяция в атрибуте").toEqual(expected)
    })

    it("смешанный контент с интерполяцией", () => {
      const result = parseTemplate(`<p>Hello \${context.name}!</p>`)
      
      const expected: Schema = [
        {
          tag: "p",
          type: "el",
          child: [
            {
              type: "text",
              value: "Hello ",
            },
            {
              type: "text",
              value: {
                src: "context",
                key: "name",
              },
            },
            {
              type: "text",
              value: "!",
            },
          ],
        },
      ]
      
      expect(result, "смешанный контент с интерполяцией").toEqual(expected)
    })
  })

  describe("атрибуты", () => {
    it("булев атрибут", () => {
      const result = parseTemplate(`<input type="checkbox" checked />`)
      
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            type: "checkbox",
            checked: "",
          },
        },
      ]
      
      expect(result, "булев атрибут").toEqual(expected)
    })

    it("атрибуты с дефисами", () => {
      const result = parseTemplate(`<div data-id="123" aria-label="Test">Content</div>`)
      
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            "data-id": "123",
            "aria-label": "Test",
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ]
      
      expect(result, "атрибуты с дефисами").toEqual(expected)
    })
  })

  describe("алиасы функций", () => {
    it("parseHtmlToSchema работает как parseTemplate", () => {
      const htmlString = `<div class="test">Content</div>`
      
      const result1 = parseTemplate(htmlString)
      const result2 = parseHtmlToSchema(htmlString)
      
      expect(result1, "результаты parseTemplate и parseHtmlToSchema должны быть одинаковыми").toEqual(result2)
    })
  })
})