import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../parser/index.ts"
import type { Schema } from "../parser/index.ts"

describe("интерполяции в атрибутах", () => {
  describe("простые интерполяции в атрибутах", () => {
    describe("простая интерполяция context в атрибуте", () => {
      const result = parseTemplate(`<div data-user="\${context.name}">Content</div>`)
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "простая интерполяция context в атрибуте").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("простая интерполяция core в атрибуте", () => {
      const result = parseTemplate(`<div data-config="\${core.settings}">Content</div>`)
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "простая интерполяция core в атрибуте").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("несколько атрибутов с интерполяциями", () => {
      const result = parseTemplate(
        `<div id="\${context.userId}" class="\${context.role}" data-name="\${core.userName}">Content</div>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "несколько атрибутов с интерполяциями").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("смешанный контент в атрибутах", () => {
    describe("префикс с интерполяцией", () => {
      const result = parseTemplate(`<div class="btn-\${context.type}">Button</div>`)
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "префикс с интерполяцией").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("суффикс с интерполяцией", () => {
      const result = parseTemplate(`<div class="\${context.theme}-mode">Content</div>`)
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "суффикс с интерполяцией").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("интерполяция в середине", () => {
      const result = parseTemplate(`<div data-key="prefix-\${core.id}-suffix">Content</div>`)
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "интерполяция в середине").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("атрибуты в массивах", () => {
    describe("простая интерполяция item в атрибуте массива", () => {
      const result = parseTemplate(
        `<ul>\${context.items.map((item) => html\`<li data-id="\${item.id}">Item</li>\`)}</ul>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "простая интерполяция item в атрибуте массива").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("смешанный контент в атрибуте массива", () => {
      const result = parseTemplate(
        `<ul>\${context.items.map((item) => html\`<li class="item-\${item.type}">Item</li>\`)}</ul>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "смешанный контент в атрибуте массива").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("множественные атрибуты в массиве", () => {
      const result = parseTemplate(
        `<ul>\${context.items.map((item) => html\`<li data-id="\${item.id}" class="item-\${item.type}" title="\${item.name}">Item</li>\`)}</ul>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "множественные атрибуты в массиве").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("комбинированные случаи", () => {
    describe("статические и динамические атрибуты", () => {
      const result = parseTemplate(
        `<div id="static-id" class="\${context.theme}" data-fixed="value" data-dynamic="\${core.version}">Content</div>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "статические и динамические атрибуты").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("массив с комбинированными атрибутами", () => {
      const result = parseTemplate(
        `<div class="wrapper">\${context.items.map((item) => html\`<span data-id="\${item.id}" class="static item-\${item.type}" title="Item: \${item.name}">Content</span>\`)}</div>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "массив с комбинированными атрибутами").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("edge cases атрибутов", () => {
    describe("пустые атрибуты должны игнорироваться", () => {
      const result = parseTemplate(`<div class="\${context.theme}">Content</div>`)
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "только динамические атрибуты").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("атрибуты с дефисами и интерполяциями", () => {
      const result = parseTemplate(
        `<div data-test-id="\${context.testId}" aria-label="Label: \${context.name}">Content</div>`
      )
      const expected: Schema = [
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
      ]
      it("парсинг", () => {
        expect(result, "атрибуты с дефисами и интерполяциями").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })
})
