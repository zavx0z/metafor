import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("интерполяции в атрибутах", () => {
  const html = String.raw
  describe("простые интерполяции в атрибутах", () => {
    describe("простая интерполяция context в атрибуте", () => {
      const { context, schema } = new Context((t) => ({ name: t.string.required("MetaFor") }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html` <div data-user="${context.name}">Content</div> `,
      })
      it("парсинг", () => {
        expect(view.schema, "простая интерполяция context в атрибуте").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              "data-user": {
                src: "context",
                key: "name",
              },
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("data-user")).toBe(context.name)
      })
    })

    describe("простая интерполяция core в атрибуте", () => {
      const core = { settings: "settings" }
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`<div data-config="${core.settings}">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "простая интерполяция core в атрибуте").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              "data-config": {
                src: "core",
                key: "settings",
              },
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, core })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("data-config")).toBe(core.settings)
      })
    })

    describe("несколько атрибутов с интерполяциями", () => {
      const core = { userName: "zavx0z" }
      const { context, schema } = new Context((t) => ({
        userId: t.number.required(1),
        role: t.string.required("SuperUser"),
      }))
      const view = new View<typeof schema, typeof core>({
        render: ({ html, context, core }) => html`
          <div id="${context.userId}" class="${context.role}" data-name="${core.userName}">Content</div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "несколько атрибутов с интерполяциями").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              id: {
                src: "context",
                key: "userId",
              },
              class: {
                src: "context",
                key: "role",
              },
              "data-name": {
                src: "core",
                key: "userName",
              },
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context, core })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("id")).toBe(context.userId.toString())
        expect(div.getAttribute("class")).toBe(context.role)
      })
    })
  })

  describe("смешанный контент в атрибутах", () => {
    describe("префикс с интерполяцией", () => {
      const { context, schema } = new Context((t) => ({ type: t.string.required("primary") }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html` <div class="btn-${context.type}">Button</div> `,
      })
      it("парсинг", () => {
        expect(view.schema, "префикс с интерполяцией").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: {
                template: "btn-${0}",
                items: [{ src: "context", key: "type" }],
              },
            },
            child: [
              {
                type: "text",
                value: "Button",
              },
            ],
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("class")).toBe("btn-primary")
      })
    })

    describe("суффикс с интерполяцией", () => {
      const { context, schema } = new Context((t) => ({ theme: t.string.required("primary") }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`<div class="${context.theme}-mode">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "суффикс с интерполяцией").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: {
                template: "${0}-mode",
                items: [{ src: "context", key: "theme" }],
              },
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("class")).toBe("primary-mode")
      })
    })

    describe("интерполяция в середине", () => {
      const core = { id: "123" }
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`<div data-key="prefix-${core.id}-suffix">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "интерполяция в середине").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              "data-key": {
                template: "prefix-${0}-suffix",
                items: [{ src: "core", key: "id" }],
              },
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, core })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("data-key")).toBe("prefix-123-suffix")
      })
    })
  })

  describe("атрибуты в массивах", () => {
    describe("простая интерполяция item в атрибуте массива", () => {
      const core = { items: [{ id: "123" }, { id: "456" }] } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <ul>
            ${core.items.map((item) => html`<li data-id="${item.id}">Item</li>`)}
          </ul>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "простая интерполяция item в атрибуте массива").toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                tag: "li",
                type: "el",
                attrs: {
                  "data-id": {
                    src: ["core", "items"],
                    key: "id",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: "Item",
                  },
                ],
                item: {
                  src: "core",
                  key: "items",
                },
              },
            ],
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("ul")
        view.render({ container: element, core })

        expect(element.innerHTML).toMatchStringHTML(html`
          <ul>
            <li data-id="${core.items[0].id}">Item</li>
            <li data-id="${core.items[1].id}">Item</li>
          </ul>
        `)
      })
    })

    describe("смешанный контент в атрибуте массива", () => {
      const core = { items: [{ type: "1" }, { type: "2" }] } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <ul>
            ${core.items.map((item) => html`<li class="item-${item.type}">Item</li>`)}
          </ul>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "смешанный контент в атрибуте массива").toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                tag: "li",
                type: "el",
                item: {
                  src: "core",
                  key: "items",
                },
                attrs: {
                  class: {
                    template: "item-${0}",
                    items: [{ src: ["core", "items"], key: "type" }],
                  },
                },
                child: [
                  {
                    type: "text",
                    value: "Item",
                  },
                ],
              },
            ],
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("ul")
        view.render({ container: element, core })
        expect(element.innerHTML).toMatchStringHTML(html`
          <ul>
            <li class="item-1">Item</li>
            <li class="item-2">Item</li>
          </ul>
        `)
      })
    })

    describe("множественные атрибуты в массиве", () => {
      const core = {
        items: [
          { id: "123", type: "1", name: "Item1" },
          { id: "456", type: "2", name: "Item2" },
        ],
      } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <ul>
            ${core.items.map(
              (item) => html`<li data-id="${item.id}" class="item-${item.type}" title="${item.name}">Item</li>`
            )}
          </ul>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "множественные атрибуты в массиве").toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                tag: "li",
                type: "el",
                item: {
                  src: "core",
                  key: "items",
                },
                attrs: {
                  "data-id": {
                    src: ["core", "items"],
                    key: "id",
                  },
                  class: {
                    template: "item-${0}",
                    items: [{ src: ["core", "items"], key: "type" }],
                  },
                  title: {
                    src: ["core", "items"],
                    key: "name",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: "Item",
                  },
                ],
              },
            ],
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("ul")
        view.render({ container: element, core })

        expect(element.innerHTML).toMatchStringHTML(html`
          <ul>
            <li data-id="${core.items[0].id}" class="item-${core.items[0].type}" title="${core.items[0].name}">Item</li>
            <li data-id="${core.items[1].id}" class="item-${core.items[1].type}" title="${core.items[1].name}">Item</li>
          </ul>
        `)
      })
    })
  })

  describe("комбинированные случаи", () => {
    describe("статические и динамические атрибуты", () => {
      const { context, schema } = new Context((t) => ({ theme: t.string.required("primary") }))
      const core = { version: "1.0.0" } as const
      const view = new View<typeof schema, typeof core>({
        render: ({ html, context, core }) => html`
          <div id="static-id" class="${context.theme}" data-fixed="value" data-dynamic="${core.version}">Content</div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "статические и динамические атрибуты").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              id: "static-id",
              class: {
                src: "context",
                key: "theme",
              },
              "data-fixed": "value",
              "data-dynamic": {
                src: "core",
                key: "version",
              },
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context, core })

        const div = element.querySelector("div")!
        expect(div).toBeDefined()
        expect(div.getAttribute("id")).toBe("static-id")
        expect(div.getAttribute("class")).toBe(context.theme)
        expect(div.getAttribute("data-fixed")).toBe("value")
        expect(div.getAttribute("data-dynamic")).toBe(core.version)
      })
    })

    describe("массив с комбинированными атрибутами", () => {
      const core = {
        items: [
          { id: "123", type: "1", name: "Item1" },
          { id: "456", type: "2", name: "Item2" },
        ],
      } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <div class="wrapper">
            ${core.items.map(
              (item) => html`
                <span data-id="${item.id}" class="static item-${item.type}" title="Item: ${item.name}"> Content </span>
              `
            )}
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "массив с комбинированными атрибутами").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "wrapper",
            },
            child: [
              {
                tag: "span",
                type: "el",
                item: {
                  src: "core",
                  key: "items",
                },
                attrs: {
                  "data-id": {
                    src: ["core", "items"],
                    key: "id",
                  },
                  class: {
                    template: "static item-${0}",
                    items: [{ src: ["core", "items"], key: "type" }],
                  },
                  title: {
                    template: "Item: ${0}",
                    items: [{ src: ["core", "items"], key: "name" }],
                  },
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
        ])
        it.skip("рендер", () => {
          const element = document.createElement("div")
          view.render({ container: element, core })

          expect(element.innerHTML).toMatchStringHTML(html`
            <div class="wrapper">
              <span
                data-id="${core.items[0].id}"
                class="static item-${core.items[0].type}"
                title="Item: ${core.items[0].name}">
                Content
              </span>
              <span
                data-id="${core.items[1].id}"
                class="static item-${core.items[1].type}"
                title="Item: ${core.items[1].name}">
                Content
              </span>
            </div>
          `)
        })
      })
    })
  })
})
