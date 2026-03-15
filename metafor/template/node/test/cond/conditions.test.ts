import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("conditions", () => {
  describe("тернарник с внутренними тегами", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(({ html, value }) => html` <div>${value.cond ? html`<em>A</em>` : html`<span>b</span>`}</div> `)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: "/value/cond",
              child: [
                {
                  tag: "em",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "A",
                    },
                  ],
                },
                {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "b",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("простой тернарный оператор с context с оберткой и соседними элементами", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html`
          <div>
            <header>Header</header>
            ${value.isActive ? html`<span>Active</span>` : html`<span>Inactive</span>`}
            <footer>Footer</footer>
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements, "простой тернарный оператор с context с оберткой и соседними элементами").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "header",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Header",
                },
              ],
            },
            {
              type: "cond",
              data: "/value/isActive",
              child: [
                {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Active",
                    },
                  ],
                },
                {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Inactive",
                    },
                  ],
                },
              ],
            },
            {
              tag: "footer",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Footer",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("сравнение нескольких переменных", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html`<div>${value.cond && value.cond2 ? html`<em>A</em>` : html`<span>b</span>`}</div>`,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: ["/value/cond", "/value/cond2"],
              expr: "_[0] && _[1]",
              child: [
                {
                  tag: "em",
                  type: "el",
                  child: [{ type: "text", value: "A" }],
                },
                {
                  tag: "span",
                  type: "el",
                  child: [{ type: "text", value: "b" }],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("сравнение переменных на равенство", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html` <div>${value.cond === value.cond2 ? html`<em>A</em>` : html`<span>b</span>`}</div> `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: ["/value/cond", "/value/cond2"],
              expr: "_[0] === _[1]",
              child: [
                {
                  tag: "em",
                  type: "el",
                  child: [{ type: "text", value: "A" }],
                },
                {
                  tag: "span",
                  type: "el",
                  child: [{ type: "text", value: "b" }],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("логические операторы без тегов", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<{ a: { type: "number" }; b: { type: "number" }; c: { type: "number" }; d: { type: "number" } }>(
        ({ html, value }) => html`${value.a < value.b && value.c > value.d ? "1" : "0"}`,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          type: "text",
          data: ["/value/a", "/value/b", "/value/c", "/value/d"],
          expr: '${_[0] < _[1] && _[2] > _[3] ? "1" : "0"}',
        },
      ])
    })
  })

  describe("условие вокруг self/void", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(({ html, value }) => html`<div>${value.flag ? html`<br />` : html`<img src="x" />`}</div>`)
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: "/value/flag",
              child: [
                {
                  tag: "br",
                  type: "el",
                },
                {
                  tag: "img",
                  type: "el",
                  string: {
                    src: "x",
                  },
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("condition внутри map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<any, { items: { show: boolean }[] }>(
        ({ html, mass }) => html`
          <div>
            ${mass.items.map((item) =>
              item.show ? html`<div class="true-branch"></div>` : html`<div class="false-branch"></div>`,
            )}
          </div>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/items",
              child: [
                {
                  type: "cond",
                  data: "[item]/show",
                  child: [
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: "true-branch",
                      },
                    },
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: "false-branch",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("map + условия", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ list: { type: "array"; default: []; required: true } }>(
        ({ html, value }) => html`
          <ul>
            ${value.list.map(
              (_, i) => html` <li>${i % 2 ? html` <em>${"A"}</em> ` : html` <strong>${"B"}</strong>`}</li> `,
            )}
          </ul>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/value/list",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "cond",
                      data: "[index]",
                      expr: "_[0] % 2",
                      child: [
                        {
                          tag: "em",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              value: "A",
                            },
                          ],
                        },
                        {
                          tag: "strong",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              value: "B",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("операторы сравнения — без тегов", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ a: { type: "number" }; b: { type: "number" }; c: { type: "number" }; d: { type: "number" } }>(
        ({ html, value }) => html`${value.a < value.b && value.c > value.d ? "1" : "0"}`,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          type: "text",
          data: ["/value/a", "/value/b", "/value/c", "/value/d"],
          expr: '${_[0] < _[1] && _[2] > _[3] ? "1" : "0"}',
        },
      ])
    })
  })
})
