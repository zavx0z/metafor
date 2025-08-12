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
                trueValue: "active",
                falseValue: "inactive",
                type: "conditional",
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
        const div = element.querySelector("div")
        expect(div).toBeDefined()
        expect(div?.classList.contains("inactive")).toBe(true)
      })
    })

    describe("тернарный оператор с core", () => {
      const core = {
        isLoading: false,
      }
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`<button disabled="${core.isLoading ? "disabled" : ""}">Submit</button>`,
      })
      it("парсинг", () => {
        expect(view.schema, "тернарный оператор с core").toEqual([
          {
            tag: "button",
            type: "el",
            attrs: {
              disabled: {
                src: "core",
                key: "isLoading",
                trueValue: "disabled",
                falseValue: "",
                type: "conditional",
              },
            },
            child: [
              {
                type: "text",
                value: "Submit",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("button")
        view.render({ element, core })
        const button = element.querySelector("button")
        expect(button).toBeDefined()
        expect(button?.disabled).toBe(true)
      })
    })
  })

  describe("логические операторы в атрибутах", () => {
    describe("логическое И в атрибуте", () => {
      const { context, schema } = new Context((t) => ({
        cannotEdit: t.boolean.required(false),
      }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`<button disabled="${context.cannotEdit && "disabled"}">Edit</button>`,
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
                trueValue: "disabled",
                type: "conditional",
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
        const button = element.querySelector("button")
        expect(button).toBeDefined()
        expect(button?.disabled).toBe(true)
      })
    })

    describe("логическое И с core", () => {
      const core = {
        isReadOnly: false,
      }
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`<input readonly="${core.isReadOnly && "readonly"}" />`,
      })
      it("парсинг", () => {
        expect(view.schema, "логическое И с core").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              readonly: {
                src: "core",
                key: "isReadOnly",
                trueValue: "readonly",
                type: "conditional",
              },
            },
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("input")
        view.render({ element, core })
        const input = element.querySelector("input")
        expect(input).toBeDefined()
        expect(input?.readOnly).toBe(true)
      })
    })

    describe("логическое И в самозакрывающемся теге (новый синтаксис)", () => {
      const core = {
        isReadOnly: false,
      }
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`<input readonly="${core.isReadOnly && "readonly"}" />`,
      })
      it("парсинг", () => {
        expect(view.schema, "логическое И в самозакрывающемся теге (новый синтаксис)").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              readonly: {
                src: "core",
                key: "isReadOnly",
                trueValue: "readonly",
                type: "conditional",
              },
            },
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("input")
        view.render({ element, core })
        const input = element.querySelector("input")
        expect(input).toBeDefined()
        expect(input?.readOnly).toBe(true)
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
                attrs: {
                  class: {
                    src: ["core", "items"],
                    key: "isSpecial",
                    trueValue: "special",
                    falseValue: "normal",
                    type: "conditional",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: { src: ["core", "items"], key: "name" },
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
          <div>${core.users.map((user) => html`<div class="${user.isAdmin && "admin-user"}">${user.name}</div>`)}</div>
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
                    trueValue: "admin-user",
                    falseValue: undefined,
                    type: "conditional",
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

    describe("логическое И в атрибуте массива без знака=", () => {
      const core = {
        users: [
          { name: "User 1", isAdmin: false },
          { name: "User 2", isAdmin: true },
        ],
      } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <div>${core.users.map((user) => html`<input ${user.isAdmin && "readonly"} />`)}</div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "логическое И в атрибуте массива без знака=").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "input",
                type: "el",
                item: {
                  src: "core",
                  key: "users",
                },
                attrs: {
                  readonly: {
                    src: ["core", "users"],
                    key: "isAdmin",
                    trueValue: "readonly",
                    falseValue: undefined,
                    type: "conditional",
                  },
                },
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
            <input />
            <input readonly />
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
              class: {
                src: "context",
                key: "isLarge",
                trueValue: "btn-lg",
                falseValue: "btn-sm",
                type: "conditional",
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
                trueValue: "dark",
                falseValue: "light",
                type: "conditional",
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

    describe.todo("суффикс с условием", () => {
      const { context, schema } = new Context((t) => ({
        status: t.boolean.required(false),
      }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`<div class="${context.status ? "active" : "inactive"}-status">Status</div>`,
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
                trueValue: "active",
                falseValue: "inactive",
                type: "conditional",
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
    describe("пустое значение в false ветви", () => {
      const { context, schema } = new Context((t) => ({
        isEnabled: t.boolean.required(false),
      }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`<input ${!context.isEnabled && "disabled"} />`,
      })
      it("парсинг", () => {
        expect(view.schema, "пустое значение в false ветви").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              disabled: {
                src: "context",
                key: "isEnabled",
                trueValue: "disabled",
                falseValue: undefined,
                type: "conditional",
              },
            },
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ element, context })
        expect(element.innerHTML).toMatchStringHTML(html`<input disabled />`)
      })
    })

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
                trueValue: "same",
                falseValue: "same",
                type: "conditional",
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
  describe("логическое И в атрибуте", () => {
    const { context, schema } = new Context((t) => ({
      cannotEdit: t.boolean.required(false),
    }))
    const view = new View<typeof schema>({
      render: ({ html, context }) => html`<button ${context.cannotEdit && "disabled"}>Edit</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "логическое И в атрибуте (новый синтаксис)").toEqual([
        {
          tag: "button",
          type: "el",
          attrs: {
            disabled: {
              src: "context",
              key: "cannotEdit",
              trueValue: "disabled",
              type: "conditional",
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
      expect(element.disabled).toBe(true)
    })
  })
})
