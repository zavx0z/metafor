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
            string: {
              "data-user": {
                data: "/context/name",
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
            string: {
              "data-config": {
                data: "/core/settings",
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
            string: {
              id: {
                data: "/context/userId",
              },
              class: {
                data: "/context/role",
              },
              "data-name": {
                data: "/core/userName",
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
            string: {
              class: {
                data: "/context/type",
                expr: "btn-${[0]}",
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
            string: {
              class: {
                data: "/context/theme",
                expr: "${[0]}-mode",
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
            string: {
              "data-key": {
                data: "/core/id",
                expr: "prefix-${[0]}-suffix",
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
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "li",
                    type: "el",
                    string: {
                      "data-id": {
                        data: "[item]/id",
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
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "li",
                    type: "el",
                    string: {
                      class: {
                        data: "[item]/type",
                        expr: "item-${[0]}",
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
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "li",
                    type: "el",
                    string: {
                      "data-id": {
                        data: "[item]/id",
                      },
                      class: {
                        data: "[item]/type",
                        expr: "item-${[0]}",
                      },
                      title: {
                        data: "[item]/name",
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
            string: {
              id: "static-id",
              class: {
                data: "/context/theme",
              },
              "data-fixed": "value",
              "data-dynamic": {
                data: "/core/version",
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
            string: {
              class: "wrapper",
            },
            child: [
              {
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    array: {
                      class: [
                        {
                          value: "static",
                        },
                        {
                          data: "[item]/type",
                          expr: "item-${[0]}",
                        },
                      ],
                    },
                    child: [
                      {
                        type: "text",
                        value: " Content ",
                      },
                    ],
                    string: {
                      "data-id": {
                        data: "[item]/id",
                      },
                      title: {
                        data: ["[item]/Item", "[item]/name"],
                        expr: "${[0]}: ${${[1]}}",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ])
      })
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
