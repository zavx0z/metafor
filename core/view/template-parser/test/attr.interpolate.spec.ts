import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - интерполяции в атрибутах", () => {
  describe("простые интерполяции в атрибутах", () => {
    it("простая интерполяция context в атрибуте", () => {
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
      expect(result, "простая интерполяция context в атрибуте").toEqual(expected)
    })

    it("простая интерполяция core в атрибуте", () => {
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
      expect(result, "простая интерполяция core в атрибуте").toEqual(expected)
    })

    it("несколько атрибутов с интерполяциями", () => {
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
      expect(result, "несколько атрибутов с интерполяциями").toEqual(expected)
    })
  })

  describe("смешанный контент в атрибутах", () => {
    it("префикс с интерполяцией", () => {
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
      expect(result, "префикс с интерполяцией").toEqual(expected)
    })

    it("суффикс с интерполяцией", () => {
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
      expect(result, "суффикс с интерполяцией").toEqual(expected)
    })

    it("интерполяция в середине", () => {
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
      expect(result, "интерполяция в середине").toEqual(expected)
    })
  })

  describe("атрибуты в массивах", () => {
    it("простая интерполяция item в атрибуте массива", () => {
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
                  src: "item",
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
      expect(result, "простая интерполяция item в атрибуте массива").toEqual(expected)
    })

    it("смешанный контент в атрибуте массива", () => {
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
                  src: "item",
                  key: "type",
                  result: "item-${item.type}",
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
      expect(result, "смешанный контент в атрибуте массива").toEqual(expected)
    })

    it("множественные атрибуты в массиве", () => {
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
                  src: "item",
                  key: "id",
                },
                class: {
                  src: "item",
                  key: "type",
                  result: "item-${item.type}",
                },
                title: {
                  src: "item",
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
      expect(result, "множественные атрибуты в массиве").toEqual(expected)
    })
  })

  describe("комбинированные случаи", () => {
    it("статические и динамические атрибуты", () => {
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
      expect(result, "статические и динамические атрибуты").toEqual(expected)
    })

    it("массив с комбинированными атрибутами", () => {
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
                  src: "item",
                  key: "id",
                },
                class: {
                  src: "item",
                  key: "type",
                  result: "static item-${item.type}",
                },
                title: {
                  src: "item",
                  key: "name",
                  result: "Item: ${item.name}",
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
      expect(result, "массив с комбинированными атрибутами").toEqual(expected)
    })
  })

  describe("edge cases атрибутов", () => {
    it("пустые атрибуты должны игнорироваться", () => {
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
      expect(result, "только динамические атрибуты").toEqual(expected)
    })

    it("атрибуты с дефисами и интерполяциями", () => {
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
      expect(result, "атрибуты с дефисами и интерполяциями").toEqual(expected)
    })
  })
})
