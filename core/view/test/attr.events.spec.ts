import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"

describe("стандартные события on*", () => {
  describe("onclick с выражением", () => {
    const view = new View({
      render: ({ html, context }) => html`<button onclick="${() => context.onClick()}">OK</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "должен распознать onclick и не сериализовать функцию").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/context/onClick",
              expr: "() => ${0}()",
            },
          },
          child: [
            {
              type: "text",
              value: "OK",
            },
          ],
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("onclick без кавычек со стрелочной функцией", () => {
    const view = new View({
      render: ({ html, context }) => html`<button onclick=${() => context.onClick()}>OK</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "onclick без кавычек со стрелочной функцией").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/context/onClick",
              expr: "() => ${0}()",
            },
          },
          child: [{ type: "text", value: "OK" }],
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("onclick без значения (булев)", () => {
    const view = new View({
      render: ({ html }) => html`<button onclick>OK</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "должен поддерживать onclick без значения").toEqual([
        {
          tag: "button",
          type: "el",
          child: [{ type: "text", value: "OK" }],
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("несколько событий в самозакрывающемся теге", () => {
    const view = new View({
      render: ({ html, core }) =>
        html`<input onclick="${() => core.onClick()}" oninput="${(e: Event) => core.onInput(e)}" />`,
    })
    it("парсинг", () => {
      expect(view.schema, "должен поддерживать несколько событий on*").toEqual([
        {
          tag: "input",
          type: "el",
          event: {
            onclick: {
              data: "/core/onClick",
              expr: "() => ${0}()",
            },
            oninput: {
              data: "/core/onInput",
              expr: "(e) => ${0}(e)",
            },
          },
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("oninput без кавычек со стрелочной функцией (input)", () => {
    const view = new View({
      render: ({ html, core }) => html`<input oninput=${(e: Event) => core.onInput(e)} />`,
    })
    it("парсинг", () => {
      expect(view.schema, "oninput без кавычек со стрелочной функцией").toEqual([
        {
          tag: "input",
          type: "el",
          event: {
            oninput: {
              data: "/core/onInput",
              expr: "(e) => ${0}(e)",
            },
          },
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("событие внутри массива", () => {
    const view = new View({
      render: ({ html, context }) => html`
        <ul>
          ${context.items.map((item: any) => html`<li onclick="${() => item.onClick()}">${item.name}</li>`)}
        </ul>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "событие внутри массива").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/context/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  event: {
                    onclick: {
                      data: "[item]/onClick",
                      expr: "() => ${0}()",
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
    it.skip("рендер", () => {})
  })

  describe("событие с параметрами в массиве", () => {
    const view = new View({
      render: ({ html, context }) => html`
        <div>
          ${context.buttons.map(
            (btn: any) => html`<button onclick="${(e: Event) => btn.handleClick(e, btn.id)}">${btn.text}</button>`
          )}
        </div>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "событие с параметрами в массиве").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/context/buttons",
              child: [
                {
                  tag: "button",
                  type: "el",
                  event: {
                    onclick: {
                      data: ["[item]/handleClick", "[item]/id"],
                      expr: "(e) => ${0}(e, ${1})",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      data: "[item]/text",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("смешанные события и обычные атрибуты", () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<form onsubmit="${(e: Event) => context.handleSubmit(e)}" class="form" method="post">
          <input type="text" onchange="${(e: Event) => context.handleChange(e)}" />
          <button type="submit" onclick="${() => context.onClick()}">Submit</button>
        </form>`,
    })
    it("парсинг", () => {
      expect(view.schema, "смешанные события и обычные атрибуты").toEqual([
        {
          tag: "form",
          type: "el",
          event: {
            onsubmit: {
              data: "/context/handleSubmit",
              expr: "(e) => ${0}(e)",
            },
          },
          string: {
            class: "form",
            method: "post",
          },
          child: [
            {
              tag: "input",
              type: "el",
              event: {
                onchange: {
                  data: "/context/handleChange",
                  expr: "(e) => ${0}(e)",
                },
              },
              string: {
                type: "text",
              },
            },
            {
              tag: "button",
              type: "el",
              event: {
                onclick: {
                  data: "/context/onClick",
                  expr: "() => ${0}()",
                },
              },
              string: {
                type: "submit",
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

  describe("события с условными атрибутами", () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<button onclick="${() => context.onClick()}" ${context.isDisabled && "disabled"}>Click me</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "события с условными атрибутами").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/context/onClick",
              expr: "() => ${0}()",
            },
          },
          boolean: {
            disabled: {
              data: "/context/isDisabled",
            },
          },
          child: [
            {
              type: "text",
              value: "Click me",
            },
          ],
        },
      ])
    })
    it.skip("рендер", () => {})
  })
})
