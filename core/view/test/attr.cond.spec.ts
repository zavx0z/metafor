import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("условные атрибуты", () => {
  const html = String.raw

  describe("тернарный оператор в атрибутах", () => {
    describe("тернарный оператор в атрибуте с числом в качестве условия", () => {
      const { context, schema } = new Context((t) => ({
        count: t.number.required(0),
      }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`
          <div class="${10 > context.count && context.count < 3 ? "active" : "inactive"}">Content</div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор в атрибуте").toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: "/context/count",
                expr: '10 > ${0} && ${0} < 3 ? "active" : "inactive"',
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
    })
    describe("тернарный оператор сравнения через ===", () => {
      const core = {
        isActive: false,
      }
      const { context, schema } = new Context((t) => ({
        isActive: t.boolean.required(false),
      }))
      const view = new View<typeof schema, typeof core>({
        render: ({ html, context, core }) =>
          html`<div class="${core.isActive === context.isActive ? "active" : "inactive"}">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "тернарный оператор сравнения").toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: ["/core/isActive", "/context/isActive"],
                expr: '${0} === ${1} ? "active" : "inactive"',
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
      it.skip("рендер", () => {})
    })
    describe("тернарный оператор сравнения через === с динамическими результатами", () => {
      const core = {
        isActive: false,
      }
      const { context } = new Context((t) => ({
        isActive: t.boolean.required(false),
        status: t.enum("waiting", "running").required("waiting"),
        item: t.string.required("any"),
      }))

      const view = new View({
        render: ({ html, context, core }) => html`
          <div class="${core.isActive === context.isActive ? `${context.item}-active-${context.status}` : "inactive"}">
            Content
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "тернарный оператор сравнения с динамическими результатами").toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: {
                data: ["/core/isActive", "/context/isActive", "/context/item", "/active", "/context/status"],
                expr: '${0} === ${1} ? `${${2}}-${3}-${${4}}` : "inactive"',
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
    })

    describe("логические операторы в атрибутах", () => {
      describe("логическое И в атрибуте", () => {
        const { context, schema } = new Context((t) => ({
          cannotEdit: t.boolean.required(true),
        }))
        const view = new View<typeof schema>({
          render: ({ html, context }) => html`<button ${context.cannotEdit && "disabled"}>Edit</button>`,
        })
        it("парсинг", () => {
          expect(view.schema, "логическое И в атрибуте").toEqual([
            {
              tag: "button",
              type: "el",
              boolean: {
                disabled: {
                  data: "/context/cannotEdit",
                },
              },
              child: [
                {
                  type: "text",
                  value: "Edit",
                },
              ],
            },
          ])
        })
        it.skip("рендер", () => {
          const element = document.createElement("button")
          view.render({ container: element, context })
          const button = element.querySelector("button")!
          expect(button).toBeDefined()
          expect(button.disabled).toBe(true)
        })
      })

      describe("логическое И в самозакрывающемся теге", () => {
        const core = {
          isReadOnly: false,
        }
        const view = new View<any, typeof core>({
          render: ({ html, core }) => html`<input ${core.isReadOnly && "readonly"} />`,
        })
        it("парсинг", () => {
          expect(view.schema, "логическое И в самозакрывающемся теге").toEqual([
            {
              tag: "input",
              type: "el",
              boolean: {
                readonly: {
                  data: "/core/isReadOnly",
                },
              },
            },
          ])
        })
        it.skip("рендер", () => {
          const element = document.createElement("input")
          view.render({ container: element, core })
          const input = element.querySelector("input")!
          expect(input).toBeDefined()
          expect(input.readOnly).toBe(false)
        })
      })
    })

    describe("условия в атрибутах массивов", () => {
      describe("условие в атрибуте массива", () => {
        const core = {
          items: [
            { name: "Item 1", isSpecial: false },
            { name: "Item 2", isSpecial: true },
          ],
        } as const
        const view = new View<any, typeof core>({
          render: ({ html, core }) => html`
            <div>
              ${core.items.map(
                (item) => html`<span class="${item.isSpecial ? "special" : "normal"}">${item.name}</span>`
              )}
            </div>
          `,
        })
        it("парсинг", () => {
          expect(view.schema, "условие в атрибуте массива").toEqual([
            {
              tag: "div",
              type: "el",
              child: [
                {
                  type: "map",
                  data: "/core/items",
                  child: [
                    {
                      tag: "span",
                      type: "el",
                      string: {
                        class: {
                          data: "[item]/isSpecial",
                          expr: '${0} ? "special" : "normal"',
                        },
                      },
                      child: [
                        {
                          type: "text",
                          data: "[item]/name",
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
          const element = document.createElement("div")
          view.render({ container: element, core })
          expect(element.innerHTML).toMatchStringHTML(html`
            <div>
              <span class="normal">${core.items[0].name}</span>
              <span class="special">${core.items[1].name}</span>
            </div>
          `)
        })
      })
      describe("условие в атрибуте массива", () => {
        const core = {
          items: [
            { name: "Item 1", isSpecial: false },
            { name: "Item 2", isSpecial: true },
          ],
        } as const
        const view = new View<any, typeof core>({
          render: ({ html, core }) => html`
            <div>
              ${core.items.map(
                (item) => html`<span class="${item.isSpecial ? "special" : "normal"}">${item.name}</span>`
              )}
            </div>
          `,
        })
        it("парсинг", () => {
          expect(view.schema, "условие в атрибуте массива").toEqual([
            {
              tag: "div",
              type: "el",
              child: [
                {
                  type: "map",
                  data: "/core/items",
                  child: [
                    {
                      tag: "span",
                      type: "el",
                      string: {
                        class: {
                          data: "[item]/isSpecial",
                          expr: '${0} ? "special" : "normal"',
                        },
                      },
                      child: [
                        {
                          type: "text",
                          data: "[item]/name",
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
          const element = document.createElement("div")
          view.render({ container: element, core })
          expect(element.innerHTML).toMatchStringHTML(html`
            <div>
              <span class="normal">${core.items[0].name}</span>
              <span class="special">${core.items[1].name}</span>
            </div>
          `)
        })
      })
      describe("условие в атрибуте массива", () => {
        const core = {
          items: [
            { name: "Item 1", isSpecial: false },
            { name: "Item 2", isSpecial: true },
          ],
        } as const
        const view = new View<any, typeof core>({
          render: ({ html, core }) => html`
            <div>
              ${core.items.map(
                (item) => html`<span class="${item.isSpecial ? "special" : "normal"}">${item.name}</span>`
              )}
            </div>
          `,
        })
        it("парсинг", () => {
          expect(view.schema, "условие в атрибуте массива").toEqual([
            {
              tag: "div",
              type: "el",
              child: [
                {
                  type: "map",
                  data: "/core/items",
                  child: [
                    {
                      tag: "span",
                      type: "el",
                      string: {
                        class: {
                          data: "[item]/isSpecial",
                          expr: '${0} ? "special" : "normal"',
                        },
                      },
                      child: [
                        {
                          type: "text",
                          data: "[item]/name",
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
          const element = document.createElement("div")
          view.render({ container: element, core })
          expect(element.innerHTML).toMatchStringHTML(html`
            <div>
              <span class="normal">${core.items[0].name}</span>
              <span class="special">${core.items[1].name}</span>
            </div>
          `)
        })
      })
      describe("условие в атрибуте массива", () => {
        const core = {
          isActive: false,
          items: [
            { name: "Item 1", isSpecial: false },
            { name: "Item 2", isSpecial: true },
          ],
        } as const
        const { context } = new Context((t) => ({
          isActive: t.boolean.required(false),
          status: t.enum("waiting", "running").required("waiting"),
        }))
        const view = new View<any, typeof core>({
          render: ({ html, core, context }) => html`
            <div>
              ${core.items.map(
                (item) => html`
                  <div
                    class="${item.isSpecial === context.isActive
                      ? `${item.name}-active-${context.status}`
                      : "inactive"}">
                    Content
                  </div>
                `
              )}
            </div>
          `,
        })
        it("парсинг", () => {
          expect(view.schema, "условие в атрибуте массива").toEqual([
            {
              tag: "div",
              type: "el",
              child: [
                {
                  type: "map",
                  data: "/core/items",
                  child: [
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: {
                          data: [
                            "[item]/isSpecial",
                            "[item]/context/isActive",
                            "[item]/name",
                            "[item]/active",
                            "[item]/context/status",
                          ],
                          expr: '${0} === ${1} ? `${${2}}-${3}-${${4}}` : "inactive"',
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
              ],
            },
          ])
        })
        it.skip("рендер", () => {
          const element = document.createElement("div")
          view.render({ container: element, core })
          expect(element.innerHTML).toMatchStringHTML(html`
            <div>
              <span class="normal">${core.items[0].name}</span>
              <span class="special">${core.items[1].name}</span>
            </div>
          `)
        })
      })

      describe("логическое И в атрибуте массива", () => {
        const core = {
          users: [
            { name: "User 1", isAdmin: false },
            { name: "User 2", isAdmin: true },
          ],
        } as const
        const view = new View<any, typeof core>({
          render: ({ html, core }) => html`
            <div>
              ${core.users.map((user) => html`<div class="${user.isAdmin && "admin-user"}">${user.name}</div>`)}
            </div>
          `,
        })
        it("парсинг", () => {
          expect(view.schema, "логическое И в атрибуте массива").toEqual([
            {
              tag: "div",
              type: "el",
              child: [
                {
                  type: "map",
                  data: "/core/users",
                  child: [
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: {
                          data: "[item]/isAdmin",
                          expr: '${0} && "admin-user"',
                        },
                      },
                      child: [
                        {
                          type: "text",
                          data: "[item]/name",
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
          const element = document.createElement("div")
          view.render({ container: element, core })
          expect(element.innerHTML).toMatchStringHTML(html`
            <div>
              <div>${core.users[0].name}</div>
              <div class="admin-user">${core.users[1].name}</div>
            </div>
          `)
        })
      })
    })

    describe("смешанный контент с условиями", () => {
      describe("смешанный контент с условием в атрибуте", () => {
        const { context, schema } = new Context((t) => ({
          isLarge: t.boolean.required(false),
        }))
        const view = new View<typeof schema>({
          render: ({ html, context }) => html`<div class="btn ${context.isLarge ? "btn-lg" : "btn-sm"}">Button</div>`,
        })
        it("парсинг", () => {
          expect(view.schema, "смешанный контент с условием в атрибуте").toEqual([
            {
              tag: "div",
              type: "el",
              array: {
                class: [
                  {
                    value: "btn",
                  },
                  {
                    data: "/context/isLarge",
                    expr: '${0} ? "btn-lg" : "btn-sm"',
                  },
                ],
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
          expect(element.innerHTML).toMatchStringHTML(html`<div class="btn btn-sm">Button</div>`)
        })
      })

      describe("префикс с условием", () => {
        const { context, schema } = new Context((t) => ({
          theme: t.string.required("light"),
        }))
        const view = new View<typeof schema>({
          render: ({ html, context }) => html`<div class="prefix-${context.theme ? "dark" : "light"}">Theme</div>`,
        })
        it("парсинг", () => {
          expect(view.schema, "префикс с условием").toEqual([
            {
              tag: "div",
              type: "el",
              string: {
                class: {
                  data: "/context/theme",
                  expr: 'prefix-${0 ? "dark" : "light"}',
                },
              },
              child: [
                {
                  type: "text",
                  value: "Theme",
                },
              ],
            },
          ])
        })
        it.skip("рендер", () => {
          const element = document.createElement("div")
          view.render({ container: element, context })
          expect(element.innerHTML).toMatchStringHTML(html`<div class="prefix-light">Theme</div>`)
        })
      })

      describe("суффикс с условием и статическими значениями", () => {
        const { context, schema } = new Context((t) => ({
          status: t.boolean.required(false),
        }))
        const view = new View<typeof schema>({
          render: ({ html, context }) =>
            html`<div class="${context.status ? "active" : "inactive"}-status">Status</div>`,
        })
        it("парсинг", () => {
          expect(view.schema, "суффикс с условием").toEqual([
            {
              tag: "div",
              type: "el",
              string: {
                class: {
                  data: "/context/status",
                  expr: '${0 ? "active" : "inactive"}-status',
                },
              },
              child: [
                {
                  type: "text",
                  value: "Status",
                },
              ],
            },
          ])
        })
        it.skip("рендер", () => {
          const element = document.createElement("div")
          view.render({ container: element, context })
          expect(element.innerHTML).toMatchStringHTML(html`<div class="inactive-status">Status</div>`)
        })
      })
    })

    describe("edge cases условных атрибутов", () => {
      describe("одинаковые значения в обеих ветвях", () => {
        const { context, schema } = new Context((t) => ({
          always: t.boolean.required(false),
        }))
        const view = new View<typeof schema>({
          render: ({ html, context }) => html`<div class="${context.always ? "same" : "same"}">Content</div>`,
        })
        it("парсинг", () => {
          expect(view.schema, "одинаковые значения в обеих ветвях").toEqual([
            {
              tag: "div",
              type: "el",
              string: {
                class: {
                  data: "/context/always",
                  expr: '${0} ? "same" : "same"',
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
          expect(element.innerHTML).toMatchStringHTML(html`<div class="same">Content</div>`)
        })
      })
    })
  })
})
