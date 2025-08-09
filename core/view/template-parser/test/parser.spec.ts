import { describe, it, expect } from "bun:test"
import { TemplateParser, parseTemplate } from "../index.ts"

describe("TemplateParser", () => {
  describe("основные функции", () => {
    it("parseTemplate функция работает", () => {
      const result = parseTemplate(`<div>Hello</div>`)
      expect(result, "parseTemplate возвращает схему").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {},
          children: [
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
          attrs: {},
          children: [
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
          attrs: {},
          children: [
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
          children: [
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
          attrs: {},
          children: [
            {
              tag: "h1",
              type: "el",
              attrs: {},
              children: [
                {
                  type: "text",
                  value: "Title",
                },
              ],
            },
            {
              tag: "p",
              type: "el",
              attrs: {},
              children: [
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
          attrs: {},
        },
        {
          tag: "span",
          type: "el",
          attrs: {},
        },
      ])
    })
  })

  describe("интерполяции", () => {
    it("простая интерполяция", () => {
      const result = parseTemplate(`<div>\${context.name}</div>`)
      expect(result, "простая интерполяция").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {},
          children: [
            {
              type: "text",
              value: { source: "item" },
            },
          ],
        },
      ])
    })

    it("смешанный текст с интерполяцией", () => {
      const result = parseTemplate(`<div>Total: \${context.count}</div>`)
      expect(result, "смешанный текст").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {},
          children: [
            {
              type: "text",
              value: "Total:",
            },
            {
              type: "text",
              value: { source: "item" },
            },
          ],
        },
      ])
    })
  })

  describe("массивы", () => {
    it("массив из context", () => {
      const result = parseTemplate(`<ul>
        \${context.ids.map((id) => html\`<li>\${id}</li>\`)}
      </ul>`)
      expect(result, "массив из контекста").toEqual([
        {
          tag: "ul",
          type: "el",
          attrs: {},
          children: [
            {
              tag: "li",
              type: "el",
              item: {
                src: "context",
                key: "ids",
              },
              attrs: {},
              children: [
                {
                  type: "text",
                  value: { source: "item" },
                },
              ],
            },
          ],
        },
      ])
    })

    it("массив из core", () => {
      const result = parseTemplate(`<div>
        \${core.users.map((user) => html\`<span>\${user.name}</span>\`)}
      </div>`)
      expect(result, "массив из core").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {},
          children: [
            {
              tag: "span",
              type: "el",
              item: {
                src: "core",
                key: "users",
              },
              attrs: {},
              children: [
                {
                  type: "text",
                  value: { source: "item" },
                },
              ],
            },
          ],
        },
      ])
    })

    it("сложный массив с атрибутами", () => {
      const result = parseTemplate(`<div class="list">
        \${core.users.map((user) => html\`<div class="user-card" data-id="\${user.id}">
          <h3>\${user.name}</h3>
          <p>\${user.email}</p>
        </div>\`)}
      </div>`)
      expect(result, "сложный массив пользователей").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {
            class: "list",
          },
          children: [
            {
              tag: "div",
              type: "el",
              item: {
                src: "core",
                key: "users",
              },
              attrs: {
                class: "user-card",
                "data-id": "SIMPLE_PLACEHOLDER",
              },
              children: [
                {
                  tag: "h3",
                  type: "el",
                  attrs: {},
                  children: [
                    {
                      type: "text",
                      value: { source: "item" },
                    },
                  ],
                },
                {
                  tag: "p",
                  type: "el",
                  attrs: {},
                  children: [
                    {
                      type: "text",
                      value: { source: "item" },
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

  describe("edge cases", () => {
    it("самозакрывающиеся теги", () => {
      const result = parseTemplate(`<div><img src="image.jpg" alt="Image" /><br /></div>`)
      expect(result, "самозакрывающиеся теги").toEqual([
        {
          tag: "div",
          type: "el",
          attrs: {},
          children: [
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
              attrs: {},
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
          children: [
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
          attrs: {},
          children: [
            {
              type: "text",
              value: "Header",
            },
          ],
        },
        {
          tag: "main",
          type: "el",
          attrs: {},
          children: [
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
