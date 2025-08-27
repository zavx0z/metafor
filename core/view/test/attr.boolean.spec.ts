import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"

describe("булевы атрибуты", () => {
  describe("простые булевы атрибуты", () => {
    describe("один булев атрибут", () => {
      const view = new View({
        render: ({ html }) => html`<input disabled />`,
      })
      it("парсинг", () => {
        expect(view.schema, "один булев атрибут").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              disabled: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("несколько булевых атрибутов", () => {
      const view = new View({
        render: ({ html }) => html`<input disabled readonly required />`,
      })
      it("парсинг", () => {
        expect(view.schema, "несколько булевых атрибутов").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              disabled: "",
              readonly: "",
              required: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("булевы атрибуты с дефисами", () => {
      const view = new View({
        render: ({ html }) => html`<input data-required aria-hidden />`,
      })
      it("парсинг", () => {
        expect(view.schema, "булевы атрибуты с дефисами").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              "data-required": "",
              "aria-hidden": "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("булевы атрибуты с обычными", () => {
    describe("булев атрибут с обычным", () => {
      const view = new View({
        render: ({ html }) => html`<input type="text" disabled />`,
      })
      it("парсинг", () => {
        expect(view.schema, "булев атрибут с обычным").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              type: "text",
              disabled: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("обычный атрибут с булевым", () => {
      const view = new View({
        render: ({ html }) => html`<button disabled class="btn">Submit</button>`,
      })
      it("парсинг", () => {
        expect(view.schema, "обычный атрибут с булевым").toEqual([
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
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("смешанные атрибуты", () => {
      const view = new View({
        render: ({ html }) => html`<input type="checkbox" checked disabled data-test />`,
      })
      it("парсинг", () => {
        expect(view.schema, "смешанные атрибуты").toEqual([
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
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("самозакрывающиеся теги с булевыми атрибутами", () => {
    describe("input с булевыми атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`<input type="text" placeholder="Enter name" required />`,
      })
      it("парсинг", () => {
        expect(view.schema, "input с булевыми атрибутами").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              type: "text",
              placeholder: "Enter name",
              required: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("img с булевыми атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`<img src="image.jpg" alt="Description" loading />`,
      })
      it("парсинг", () => {
        expect(view.schema, "img с булевыми атрибутами").toEqual([
          {
            tag: "img",
            type: "el",
            attrs: {
              src: "image.jpg",
              alt: "Description",
              loading: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("вложенные элементы с булевыми атрибутами", () => {
    describe("вложенные элементы", () => {
      const view = new View({
        render: ({ html }) => html`
          <form>
            <input type="text" required />
            <button type="submit" disabled>Submit</button>
          </form>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "вложенные элементы").toEqual([
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
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("edge cases булевых атрибутов", () => {
    describe("булев атрибут в конце", () => {
      const view = new View({
        render: ({ html }) => html`<input type="text" disabled />`,
      })
      it("парсинг", () => {
        expect(view.schema, "булев атрибут в конце").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              type: "text",
              disabled: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("булев атрибут в начале", () => {
      const view = new View({
        render: ({ html }) => html`<input disabled type="text" />`,
      })
      it("парсинг", () => {
        expect(view.schema, "булев атрибут в начале").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              disabled: "",
              type: "text",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("только булевы атрибуты", () => {
      const view = new View({
        render: ({ html }) => html`<input disabled readonly required />`,
      })
      it("парсинг", () => {
        expect(view.schema, "только булевы атрибуты").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              disabled: "",
              readonly: "",
              required: "",
            },
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })
})
