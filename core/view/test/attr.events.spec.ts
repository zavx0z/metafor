import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "@zavx0z/context"

describe("стандартные события on*", () => {
  describe("onclick с выражением", () => {
    const core = {
      onClick: () => {},
    }
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`<button onclick="${() => core.onClick()}">OK</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "должен распознать onclick и не сериализовать функцию").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/context/onClick",
              expr: "() => ${[0]}()",
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
    const core = {
      onClick: () => {},
    }
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`<button onclick=${() => core.onClick()}>OK</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "onclick без кавычек со стрелочной функцией").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/core/onClick",
              expr: "() => ${[0]}()",
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
              expr: "() => ${[0]}()",
            },
            oninput: {
              data: "/core/onInput",
              expr: "(e) => ${[0]}(e)",
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
              expr: "(e) => ${[0]}(e)",
            },
          },
        },
      ])
    })
    it.skip("рендер", () => {})
  })

  describe("событие внутри массива", () => {
    const core = {
      items: [{ name: "Item 1", onClick: () => {} }],
    }
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`<li onclick="${() => item.onClick()}">${item.name}</li>`)}
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
              data: "/core/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  event: {
                    onclick: {
                      data: "[item]/onClick",
                      expr: "() => ${[0]}()",
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
    const core = {
      buttons: [{ text: "Button 1", handleClick: (e: Event, id: number) => {}, id: 1 }],
    }
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <div>
          ${core.buttons.map(
            (btn) => html`<button onclick="${(e: Event) => btn.handleClick(e, btn.id)}">${btn.text}</button>`
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
              data: "/core/buttons",
              child: [
                {
                  tag: "button",
                  type: "el",
                  event: {
                    onclick: {
                      data: ["[item]/handleClick", "[item]/id"],
                      expr: "(e) => ${[0]}(e, ${[1]})",
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
    const core = {
      handleSubmit: (e: Event) => {},
      handleChange: (e: Event) => {},
      onClick: () => {},
    }
    const view = new View<any, typeof core>({
      render: ({ html, core }) =>
        html`<form onsubmit="${(e: Event) => core.handleSubmit(e)}" class="form" method="post">
          <input type="text" onchange="${(e: Event) => core.handleChange(e)}" />
          <button type="submit" onclick="${() => core.onClick()}">Submit</button>
        </form>`,
    })
    it("парсинг", () => {
      expect(view.schema, "смешанные события и обычные атрибуты").toEqual([
        {
          tag: "form",
          type: "el",
          event: {
            onsubmit: {
              data: "/core/handleSubmit",
              expr: "(e) => ${[0]}(e)",
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
                  data: "/core/handleChange",
                  expr: "(e) => ${[0]}(e)",
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
                  data: "/core/onClick",
                  expr: "() => ${[0]}()",
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
    const core = {
      onClick: () => {},
      isDisabled: false,
    }
    const view = new View<any, typeof core>({
      render: ({ html, context }) =>
        html`<button onclick="${() => core.onClick()}" ${core.isDisabled && "disabled"}>Click me</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "события с условными атрибутами").toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              data: "/core/onClick",
              expr: "() => ${[0]}()",
            },
          },
          boolean: {
            disabled: {
              data: "/core/isDisabled",
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
