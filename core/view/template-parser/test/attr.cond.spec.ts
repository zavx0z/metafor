import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - условные атрибуты", () => {
  describe("тернарный оператор в атрибутах", () => {
    it("простой тернарный оператор в атрибуте", () => {
      const result = parseTemplate(`<div class="\${context.isActive ? 'active' : 'inactive'}">Content</div>`)
      const expected: Schema = [
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
      ] as const
      expect(result, "простой тернарный оператор в атрибуте").toEqual(expected)
    })

    it("тернарный оператор с core", () => {
      const result = parseTemplate(`<button disabled="\${core.isLoading ? 'disabled' : ''}">Submit</button>`)
      const expected: Schema = [
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
      ] as const
      expect(result, "тернарный оператор с core").toEqual(expected)
    })
  })

  describe("логические операторы в атрибутах", () => {
    it("логическое И в атрибуте", () => {
      const result = parseTemplate(`<button disabled="\${context.cannotEdit && 'disabled'}">Edit</button>`)
      const expected: Schema = [
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
      ] as const
      expect(result, "логическое И в атрибуте").toEqual(expected)
    })

    it("логическое И с core", () => {
      const result = parseTemplate(`<input readonly="\${core.isReadOnly && 'readonly'}">`)
      const expected: Schema = [
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
      ] as const
      expect(result, "логическое И с core").toEqual(expected)
    })
  })

  describe("условия в атрибутах массивов", () => {
    it("условие в атрибуте массива", () => {
      const result = parseTemplate(`
        <div>
          \${context.items.map(item => html\`
            <span class="\${item.isSpecial ? 'special' : 'normal'}">\${item.name}</span>
          \`)}
        </div>
      `)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "span",
              type: "el",
              attrs: {
                class: {
                  src: "item",
                  key: "isSpecial",
                  trueValue: "special",
                  falseValue: "normal",
                  type: "conditional",
                },
              },
              child: [
                {
                  type: "text",
                  value: { src: "item", key: "name" },
                },
              ],
              item: {
                src: "context",
                key: "items",
              },
            },
          ],
        },
      ] as const
      expect(result, "условие в атрибуте массива").toEqual(expected)
    })

    it("логическое И в атрибуте массива", () => {
      const result = parseTemplate(`
        <div>
          \${context.users.map(user => html\`
            <div class="\${user.isAdmin && 'admin-user'}">\${user.name}</div>
          \`)}
        </div>
      `)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "div",
              type: "el",
              attrs: {
                class: {
                  src: "item",
                  key: "isAdmin",
                  trueValue: "admin-user",
                  type: "conditional",
                },
              },
              child: [
                {
                  type: "text",
                  value: { src: "item", key: "name" },
                },
              ],
              item: {
                src: "context",
                key: "users",
              },
            },
          ],
        },
      ] as const
      expect(result, "логическое И в атрибуте массива").toEqual(expected)
    })
  })

  describe("смешанный контент с условиями", () => {
    it("смешанный контент с условием в атрибуте", () => {
      const result = parseTemplate(`<div class="btn \${context.isLarge ? 'btn-lg' : 'btn-sm'}">Button</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: {
              src: "context",
              key: "isLarge",
              trueValue: "btn-lg",
              falseValue: "btn-sm",
              result: "btn \${context.isLarge ? 'btn-lg' : 'btn-sm'}",
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
      ] as const
      expect(result, "смешанный контент с условием в атрибуте").toEqual(expected)
    })

    it("префикс с условием", () => {
      const result = parseTemplate(`<div class="prefix-\${context.theme ? 'dark' : 'light'}">Theme</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: {
              src: "context",
              key: "theme",
              trueValue: "dark",
              falseValue: "light",
              result: "prefix-\${context.theme ? 'dark' : 'light'}",
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
      ] as const
      expect(result, "префикс с условием").toEqual(expected)
    })

    it("суффикс с условием", () => {
      const result = parseTemplate(`<div class="\${context.status ? 'active' : 'inactive'}-status">Status</div>`)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          attrs: {
            class: {
              src: "context",
              key: "status",
              trueValue: "active",
              falseValue: "inactive",
              result: "\${context.status ? 'active' : 'inactive'}-status",
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
      ] as const
      expect(result, "суффикс с условием").toEqual(expected)
    })
  })

  describe("edge cases условных атрибутов", () => {
    it("пустое значение в false ветви", () => {
      const result = parseTemplate(`<input disabled="\${context.isEnabled ? '' : 'disabled'}">`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            disabled: {
              src: "context",
              key: "isEnabled",
              trueValue: "",
              falseValue: "disabled",
              type: "conditional",
            },
          },
        },
      ] as const
      expect(result, "пустое значение в false ветви").toEqual(expected)
    })

    it("одинаковые значения в обеих ветвях", () => {
      const result = parseTemplate(`<div class="\${context.always ? 'same' : 'same'}">Content</div>`)
      const expected: Schema = [
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
      ] as const
      expect(result, "одинаковые значения в обеих ветвях").toEqual(expected)
    })
  })
})
