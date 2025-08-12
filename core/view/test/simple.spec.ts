import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"

describe("TemplateParser", () => {
  describe("парсинг элементов", () => {
    describe("простой HTML элемент", () => {
      const view = new View({
        render: ({ html }) => html`<div>Hello, world!</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой div с текстом").toEqual([
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
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual("<div>Hello, world!</div>")
      })
    })
    describe("web-component", () => {
      const view = new View({
        render: ({ html }) => html`<web-component></web-component>`,
      })
      it("парсинг", () => {
        expect(view.schema, "web-component").toEqual([
          {
            tag: "web-component",
            type: "wc",
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual("<web-component></web-component>")
      })
    })
    describe("web-component с самозакрывающимся тегом", () => {
      const view = new View({
        render: ({ html }) => html`<web-component />`,
      })
      it("парсинг", () => {
        expect(view.schema, "web-component с самозакрывающимся тегом").toEqual([
          {
            tag: "web-component",
            type: "wc",
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual("<web-component></web-component>")
      })
    })
    describe("элемент с атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`<div class="container" id="main">Content</div>`,
      })
      it("парсинг", () =>
        expect(view.schema, "div с атрибутами").toEqual([
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
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual('<div class="container" id="main">Content</div>')
      })
    })
    describe("вложенные элементы", () => {
      const view = new View({
        render: ({ html }) =>
          html`<div>
            <h1>Title</h1>
            <p>Description</p>
          </div>`,
      })
      it("парсинг", () =>
        expect(view.schema, "вложенные элементы").toEqual([
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
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual("<div><h1>Title</h1><p>Description</p></div>")
      })
    })

    it("пустые элементы", () => {
      const view = new View({
        render: ({ html }) =>
          html`<div></div>
            <span></span>`,
      })
      it("парсинг", () =>
        expect(view.schema, "пустые элементы").toEqual([
          {
            tag: "div",
            type: "el",
          },
          {
            tag: "span",
            type: "el",
          },
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual("<div></div><span></span>")
      })
    })
  })

  describe("интерполяции", () => {
    describe("простая интерполяция", () => {
      const view = new View({
        render: ({ html, context }) => html`<div>${context.name}</div>`,
      })
      it("парсинг", () =>
        expect(view.schema, "простая интерполяция").toEqual([
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
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            name: "test",
          },
        })
        expect(element.innerHTML).toEqual("<div>test</div>")
      })
    })

    describe("смешанный текст с интерполяцией", () => {
      const view = new View({
        render: ({ html, context }) => html`<div>Total: ${context.count}</div>`,
      })
      it("парсинг", () =>
        expect(view.schema, "смешанный текст с интерполяцией").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "text",
                value: {
                  items: [{ src: "context", key: "count" }],
                  template: "Total: ${0}",
                },
              },
            ],
          },
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            count: 10,
          },
        })
        expect(element.innerHTML).toEqual("<div>Total: 10</div>")
      })
    })
  })

  describe("edge cases", () => {
    describe("самозакрывающиеся теги", () => {
      const view = new View({
        render: ({ html }) => html`<div><img src="image.jpg" alt="Image" /><br /></div>`,
      })
      it("парсинг", () =>
        expect(view.schema, "самозакрывающиеся теги").toEqual([
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
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual('<div><img src="image.jpg" alt="Image"><br></div>')
      })
    })

    describe("атрибуты с дефисами", () => {
      const view = new View({
        render: ({ html }) => html`<div data-test="value" aria-label="test">Content</div>`,
      })
      it("парсинг", () =>
        expect(view.schema, "атрибуты с дефисами").toEqual([
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
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual('<div data-test="value" aria-label="test">Content</div>')
      })
    })

    describe("множественные корневые элементы", () => {
      const view = new View({
        render: ({ html }) =>
          html`<header>Header</header>
            <main>Main</main>`,
      })
      it("парсинг", () =>
        expect(view.schema, "несколько корневых элементов").toEqual([
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
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toEqual("<header>Header</header><main>Main</main>")
      })
    })
  })
})
