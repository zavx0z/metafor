import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"

describe("интерполяции в атрибутах", () => {
  describe("простые интерполяции в атрибутах", () => {
    describe("простая интерполяция context в атрибуте", () => {
      const view = new View({
        render: ({ html, context }) => html`<div data-user="${context.name}">Content</div>`,
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
      it("рендер", () => {})
    })

    describe("простая интерполяция core в атрибуте", () => {
      const view = new View({
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
      it("рендер", () => {})
    })

    describe("несколько атрибутов с интерполяциями", () => {
      const view = new View({
        render: ({ html, context, core }) =>
          html`<div id="${context.userId}" class="${context.role}" data-name="${core.userName}">Content</div>`,
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
      it("рендер", () => {})
    })
  })

  describe("смешанный контент в атрибутах", () => {
    describe("префикс с интерполяцией", () => {
      const view = new View({
        render: ({ html, context }) => html`<div class="btn-${context.type}">Button</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "префикс с интерполяцией").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: {
                src: "context",
                key: "type",
                result: "btn-${context.type}",
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
      it("рендер", () => {})
    })

    describe("суффикс с интерполяцией", () => {
      const view = new View({
        render: ({ html, context }) => html`<div class="${context.theme}-mode">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "суффикс с интерполяцией").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: {
                src: "context",
                key: "theme",
                result: "${context.theme}-mode",
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

    describe("интерполяция в середине", () => {
      const view = new View({
        render: ({ html, core }) => html`<div data-key="prefix-${core.id}-suffix">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "интерполяция в середине").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              "data-key": {
                src: "core",
                key: "id",
                result: "prefix-${core.id}-suffix",
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
  })

  describe("атрибуты в массивах", () => {
    describe("простая интерполяция item в атрибуте массива", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<ul>
            ${context.items.map((item: any) => html`<li data-id="${item.id}">Item</li>`)}
          </ul>`,
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
                    src: ["context", "items"],
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
                  src: "context",
                  key: "items",
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })

    describe("смешанный контент в атрибуте массива", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<ul>
            ${context.items.map((item: any) => html`<li class="item-${item.type}">Item</li>`)}
          </ul>`,
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
                attrs: {
                  class: {
                    src: ["context", "items"],
                    key: "type",
                    result: "item-${VALUE}",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: "Item",
                  },
                ],
                item: {
                  src: "context",
                  key: "items",
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })

    describe("множественные атрибуты в массиве", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<ul>
            ${context.items.map(
              (item: any) => html`<li data-id="${item.id}" class="item-${item.type}" title="${item.name}">Item</li>`
            )}
          </ul>`,
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
                attrs: {
                  "data-id": {
                    src: ["context", "items"],
                    key: "id",
                  },
                  class: {
                    src: ["context", "items"],
                    key: "type",
                    result: "item-${VALUE}",
                  },
                  title: {
                    src: ["context", "items"],
                    key: "name",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: "Item",
                  },
                ],
                item: {
                  src: "context",
                  key: "items",
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })
  })

  describe("комбинированные случаи", () => {
    describe("статические и динамические атрибуты", () => {
      const view = new View({
        render: ({ html, context, core }) =>
          html`<div id="static-id" class="${context.theme}" data-fixed="value" data-dynamic="${core.version}">
            Content
          </div>`,
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
      it("рендер", () => {})
    })

    describe("массив с комбинированными атрибутами", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div class="wrapper">
            ${context.items.map(
              (item: any) =>
                html`<span data-id="${item.id}" class="static item-${item.type}" title="Item: ${item.name}">
                  Content
                </span>`
            )}
          </div>`,
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
                attrs: {
                  "data-id": {
                    src: ["context", "items"],
                    key: "id",
                  },
                  class: {
                    src: ["context", "items"],
                    key: "type",
                    result: "static item-${VALUE}",
                  },
                  title: {
                    src: ["context", "items"],
                    key: "name",
                    result: "Item: ${VALUE}",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: "Content",
                  },
                ],
                item: {
                  src: "context",
                  key: "items",
                },
              },
            ],
          },
        ])
        it("рендер", () => {})
      })
    })

    describe("edge cases атрибутов", () => {
      describe("пустые атрибуты должны игнорироваться", () => {
        const view = new View({
          render: ({ html, context }) => html`<div class="${context.theme}">Content</div>`,
        })
        it("парсинг", () => {
          expect(view.schema, "пустые атрибуты должны игнорироваться").toEqual([
            {
              tag: "div",
              type: "el",
              attrs: {
                class: {
                  src: "context",
                  key: "theme",
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

      describe("атрибуты с дефисами и интерполяциями", () => {
        const view = new View({
          render: ({ html, context }) =>
            html`<div data-test-id="${context.testId}" aria-label="Label: ${context.name}">Content</div>`,
        })
        it("парсинг", () => {
          expect(view.schema, "атрибуты с дефисами и интерполяциями").toEqual([
            {
              tag: "div",
              type: "el",
              attrs: {
                "data-test-id": {
                  src: "context",
                  key: "testId",
                },
                "aria-label": {
                  src: "context",
                  key: "name",
                  result: "Label: ${context.name}",
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
    })
  })
})
