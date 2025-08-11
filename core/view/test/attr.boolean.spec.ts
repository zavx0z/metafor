import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../parser/index.ts"
import type { Schema } from "../parser/index.ts"

describe("булевы атрибуты", () => {
  describe("простые булевы атрибуты", () => {
    describe("один булев атрибут", () => {
      const result = parseTemplate(`<input disabled />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            disabled: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "один булев атрибут").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("несколько булевых атрибутов", () => {
      const result = parseTemplate(`<input disabled readonly required />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            disabled: "",
            readonly: "",
            required: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "несколько булевых атрибутов").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("булевы атрибуты с дефисами", () => {
      const result = parseTemplate(`<input data-required aria-hidden />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            "data-required": "",
            "aria-hidden": "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "булевы атрибуты с дефисами").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("булевы атрибуты с обычными", () => {
    describe("булев атрибут с обычным", () => {
      const result = parseTemplate(`<input type="text" disabled />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            type: "text",
            disabled: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "булев атрибут с обычным").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("обычный атрибут с булевым", () => {
      const result = parseTemplate(`<button disabled class="btn">Submit</button>`)
      const expected: Schema = [
        {
          tag: "button",
          type: "el",
          attrs: {
            disabled: "",
            class: "btn",
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
        expect(result, "обычный атрибут с булевым").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("смешанные атрибуты", () => {
      const result = parseTemplate(`<input type="checkbox" checked disabled data-test />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            type: "checkbox",
            checked: "",
            disabled: "",
            "data-test": "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "смешанные атрибуты").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("самозакрывающиеся теги с булевыми атрибутами", () => {
    describe("input с булевыми атрибутами", () => {
      const result = parseTemplate(`<input type="text" placeholder="Enter name" required />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            type: "text",
            placeholder: "Enter name",
            required: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "input с булевыми атрибутами").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("img с булевыми атрибутами", () => {
      const result = parseTemplate(`<img src="image.jpg" alt="Description" loading />`)
      const expected: Schema = [
        {
          tag: "img",
          type: "el",
          attrs: {
            src: "image.jpg",
            alt: "Description",
            loading: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "img с булевыми атрибутами").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("вложенные элементы с булевыми атрибутами", () => {
    describe("вложенные элементы", () => {
      const result = parseTemplate(`
        <form>
          <input type="text" required />
          <button type="submit" disabled>Submit</button>
        </form>
      `)
      const expected: Schema = [
        {
          tag: "form",
          type: "el",
          child: [
            {
              tag: "input",
              type: "el",
              attrs: {
                type: "text",
                required: "",
              },
            },
            {
              tag: "button",
              type: "el",
              attrs: {
                type: "submit",
                disabled: "",
              },
              child: [
                {
                  type: "text",
                  value: "Submit",
                },
              ],
            },
          ],
        },
      ] as const
      it("парсинг", () => {
        expect(result, "вложенные элементы").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("edge cases булевых атрибутов", () => {
    describe("булев атрибут в конце", () => {
      const result = parseTemplate(`<input type="text" disabled />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            type: "text",
            disabled: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "булев атрибут в конце").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("булев атрибут в начале", () => {
      const result = parseTemplate(`<input disabled type="text" />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            disabled: "",
            type: "text",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "булев атрибут в начале").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("только булевы атрибуты", () => {
      const result = parseTemplate(`<input disabled readonly required />`)
      const expected: Schema = [
        {
          tag: "input",
          type: "el",
          attrs: {
            disabled: "",
            readonly: "",
            required: "",
          },
        },
      ] as const
      it("парсинг", () => {
        expect(result, "только булевы атрибуты").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })
})
