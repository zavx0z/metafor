import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../parser/index.ts"
import type { Schema } from "../parser/index.ts"

describe("условные атрибуты", () => {
  describe("тернарный оператор в атрибутах", () => {
    describe("простой тернарный оператор в атрибуте", () => {
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
      it("парсинг", () => {
        expect(result, "простой тернарный оператор в атрибуте").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("тернарный оператор с core", () => {
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
      it("парсинг", () => {
        expect(result, "тернарный оператор с core").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("логические операторы в атрибутах", () => {
    describe("логическое И в атрибуте", () => {
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
      it("парсинг", () => {
        expect(result, "логическое И в атрибуте").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("логическое И с core", () => {
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
      it("парсинг", () => {
        expect(result, "логическое И с core").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("логическое И в самозакрывающемся теге (новый синтаксис)", () => {
      const result = parseTemplate(`<input \${core.isReadOnly && "readonly"} />`)
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
      it("парсинг", () => {
        expect(result, "логическое И в самозакрывающемся теге (новый синтаксис)").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("условия в атрибутах массивов", () => {
    describe("условие в атрибуте массива", () => {
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
                  src: ["context", "items"],
                  key: "isSpecial",
                  trueValue: "special",
                  falseValue: "normal",
                  type: "conditional",
                },
              },
              child: [
                {
                  type: "text",
                  value: { src: ["context", "items"], key: "name" },
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
      it("парсинг", () => {
        expect(result, "условие в атрибуте массива").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("логическое И в атрибуте массива", () => {
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
                  src: ["context", "users"],
                  key: "isAdmin",
                  trueValue: "admin-user",
                  falseValue: undefined,
                  type: "conditional",
                },
              },
              child: [
                {
                  type: "text",
                  value: { src: ["context", "users"], key: "name" },
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
      it("парсинг", () => {
        expect(result, "логическое И в атрибуте массива").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("логическое И в атрибуте массива без знака=", () => {
      const result = parseTemplate(`
        <div>
          ${"${context.users.map(user => html`<input ${user.isAdmin && 'readonly'} />`)}"}
        </div>
      `)
      const expected: Schema = [
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "input",
              type: "el",
              attrs: {
                readonly: {
                  src: "item",
                  key: "isAdmin",
                  trueValue: "readonly",
                  type: "conditional",
                },
              },
              item: {
                src: "context",
                key: "users",
              },
            },
          ],
        },
      ] as const
      it("парсинг", () => {
        expect(result, "логическое И в атрибуте массива без знака=").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("смешанный контент с условиями", () => {
    describe("смешанный контент с условием в атрибуте", () => {
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
              result: "btn ${context.isLarge ? 'btn-lg' : 'btn-sm'}",
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
      it("парсинг", () => {
        expect(result, "смешанный контент с условием в атрибуте").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("префикс с условием", () => {
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
              result: "prefix-${context.theme ? 'dark' : 'light'}",
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
      it("парсинг", () => {
        expect(result, "префикс с условием").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("суффикс с условием", () => {
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
              result: "${context.status ? 'active' : 'inactive'}-status",
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
      it("парсинг", () => {
        expect(result, "суффикс с условием").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("edge cases условных атрибутов", () => {
    describe("пустое значение в false ветви", () => {
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
      it("парсинг", () => {
        expect(result, "пустое значение в false ветви").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("одинаковые значения в обеих ветвях", () => {
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
      it("парсинг", () => {
        expect(result, "одинаковые значения в обеих ветвях").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })
  describe("логическое И в атрибуте", () => {
    const result = parseTemplate(`<button \${context.cannotEdit && "disabled"}>Edit</button>`)
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
    it("парсинг", () => {
      expect(result, "логическое И в атрибуте (новый синтаксис)").toEqual(expected)
    })
    it("рендер", () => {})
  })
})
