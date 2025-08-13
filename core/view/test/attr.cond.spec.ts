import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("условные атрибуты", () => {
  const html = String.raw

  describe("тернарный оператор в атрибутах", () => {
    describe("простой тернарный оператор в атрибуте", () => {
      const { context, schema } = new Context((t) => ({
        isActive: t.boolean.required(false),
      }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`<div class="${context.isActive ? "active" : "inactive"}">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор в атрибуте").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: {
                src: "context",
                key: "isActive",
                true: "active",
                false: "inactive",
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
      it("структура источника оператора сравнения", () => {
        expect(Object.hasOwn(view.schema[0].attrs.class, "items"), "не должно быть items, так как это оператор из одного значения").toBeFalse()
        expect(view.schema[0].attrs.class.src, "целевым объектом является контекст").toBe("context")
        expect(view.schema[0].attrs.class.key, "ключом источника является isActive").toBe("isActive")
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ element, context })
        expect(element.innerHTML).toMatchStringHTML(html`<div class="inactive">Content</div>`)
      })
    })
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
            attrs: {
              class: {
                items: [
                  {
                    src: "context",
                    key: "count",
                  },
                ],
                true: "active",
                false: "inactive",
                template: "10>${0}&&${0}<3",
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
            attrs: {
              class: {
                items: [
                  {
                    src: "core",
                    key: "isActive",
                  },
                  {
                    src: "context",
                    key: "isActive",
                  },
                ],
                true: "active",
                false: "inactive",
                template: "${0}===${1}",
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
      it("рендер", () => {})
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
            attrs: {
              class: {
                items: [
                  {
                    src: "core",
                    key: "isActive",
                  },
                  {
                    src: "context",
                    key: "isActive",
                  },
                ],
                true: {
                  items: [
                    {
                      src: "context",
                      key: "item",
                    },
                    {
                      src: "context",
                      key: "status",
                    },
                  ],
                  template: "${0}-active-${1}",
                },
                false: "inactive",
                template: "${0}===${1}",
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
              attrs: {
                disabled: {
                  src: "context",
                  key: "cannotEdit",
                  true: "disabled",
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
        it("рендер", () => {
          const element = document.createElement("button")
          view.render({ element, context })
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
              attrs: {
                readonly: {
                  src: "core",
                  key: "isReadOnly",
                  true: "readonly",
                },
              },
            },
          ])
        })
        it("рендер", () => {
          const element = document.createElement("input")
          view.render({ element, core })
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
                  tag: "span",
                  type: "el",
                  item: {
                    src: "core",
                    key: "items",
                  },
                  attrs: {
                    class: {
                      src: ["core", "items"],
                      key: "isSpecial",
                      true: "special",
                      false: "normal",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: { src: ["core", "items"], key: "name" },
                    },
                  ],
                },
              ],
            },
          ])
        })
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, core })
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
                  tag: "span",
                  type: "el",
                  item: {
                    src: "core",
                    key: "items",
                  },
                  attrs: {
                    class: {
                      src: ["core", "items"],
                      key: "isSpecial",
                      true: "special",
                      false: "normal",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: { src: ["core", "items"], key: "name" },
                    },
                  ],
                },
              ],
            },
          ])
        })
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, core })
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
                  tag: "span",
                  type: "el",
                  item: {
                    src: "core",
                    key: "items",
                  },
                  attrs: {
                    class: {
                      src: ["core", "items"],
                      key: "isSpecial",
                      true: "special",
                      false: "normal",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: { src: ["core", "items"], key: "name" },
                    },
                  ],
                },
              ],
            },
          ])
        })
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, core })
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
                  tag: "span",
                  type: "el",
                  item: {
                    src: "core",
                    key: "items",
                  },
                  attrs: {
                    class: {
                      items: [
                        {
                          src: ["core", "items"],
                          key: "isSpecial",
                        },
                        {
                          src: "context",
                          key: "isActive",
                        },
                      ],
                      true: {
                        items: [
                          {
                            src: ["core", "items"],
                            key: "name",
                          },
                          {
                            src: "context",
                            key: "status",
                          },
                        ],
                        template: "${0}-active-${1}",
                      },
                      false: "normal",
                      template: "${0}===${1}",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: { src: ["core", "items"], key: "name" },
                    },
                  ],
                },
              ],
            },
          ])
        })
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, core })
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
                  tag: "div",
                  type: "el",
                  item: {
                    src: "core",
                    key: "users",
                  },
                  attrs: {
                    class: {
                      src: ["core", "users"],
                      key: "isAdmin",
                      true: "admin-user",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: { src: ["core", "users"], key: "name" },
                    },
                  ],
                },
              ],
            },
          ])
        })
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, core })
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
              attrs: {
                class: [
                  "btn",
                  {
                    src: "context",
                    key: "isLarge",
                    true: "btn-lg",
                    false: "btn-sm",
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
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, context })
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
              attrs: {
                class: {
                  src: "context",
                  key: "theme",
                  true: {
                    src: "context",
                    key: "theme",
                    template: "prefix-${0}",
                  },
                  false: {
                    src: "context",
                    key: "theme",
                    template: "prefix-${0}",
                  },
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
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, context })
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
              attrs: {
                class: {
                  src: "context",
                  key: "status",
                  true: "active-status",
                  false: "inactive-status",
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
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, context })
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
              attrs: {
                class: {
                  src: "context",
                  key: "always",
                  true: "same",
                  false: "same",
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
        it("рендер", () => {
          const element = document.createElement("div")
          view.render({ element, context })
          expect(element.innerHTML).toMatchStringHTML(html`<div class="same">Content</div>`)
        })
      })
    })
  })
})
