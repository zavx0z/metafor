import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("атрибуты", () => {
  describe("namespace", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html }) => html`<svg:use xlink:href="#id"></svg:use>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "svg:use",
          type: "el",
          string: {
            "xlink:href": "#id",
          },
        },
      ])
    })
  })
  describe("пустые значения", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html }) => html`<div class="" id="">Content</div>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ])
    })
  })
  describe("двойные/одинарные кавычки", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html }) => html`<a href="https://e.co" target="_blank">x</a>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "a",
          type: "el",
          string: {
            href: "https://e.co",
            target: "_blank",
          },
          child: [
            {
              type: "text",
              value: "x",
            },
          ],
        },
      ])
    })
  })

  describe("угловые скобки внутри значения", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse(({ html }) => html`<div title="a > b, c < d"></div>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: "a > b, c < d",
          },
        },
      ])
    })
  })

  describe("условие в атрибуте", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse<{ flag: boolean }>(
        ({ html, fields }) => html`<div title="${fields.flag ? "a > b" : "c < d"}"></div>`
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              data: "/fields/flag",
              expr: '${_[0] ? "a > b" : "c < d"}',
            },
          },
        },
      ])  
    })
  })

  describe("условие в аттрибуте без кавычек", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse<{ flag: boolean }>(
        ({ html, fields }) => html`<div title=${fields.flag ? "a > b" : "c < d"}></div>`
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              data: "/fields/flag",
              expr: '${_[0] ? "a > b" : "c < d"}',
            },
          },
        },
      ])
    })
  })

  describe("условие в аттрибуте с одинарными кавычками", () => {
    let elements: Node[]
    beforeAll(() => {
      elements = parse<{ flag: boolean }>(
        // prettier-ignore
        ({ html, fields }) => html`<div title='${fields.flag ? "a > b" : "c < d"}'></div>`
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              data: "/fields/flag",
              expr: '${_[0] ? "a > b" : "c < d"}',
            },
          },
        },
      ])
    })
  })
})

describe("булевы атрибуты", () => {
  let elements: Node[]
  beforeAll(() => {
    elements = parse<{ flag: boolean }>(({ html, fields }) => html`<button ${fields.flag && "disabled"}></button>`)
  })
  it("data", () => {
    expect(elements).toEqual([
      {
        tag: "button",
        type: "el",
        boolean: {
          disabled: {
            data: "/fields/flag",
          },
        },
      },
    ])
  })
})

describe("класс в map", () => {
  let elements: Node[]
  beforeAll(() => {
    elements = parse<any, { items: { type: string; name: string }[] }>(
      ({ html, mass }) => html`
        <ul>
          ${mass.items.map((item) => html`<li class="item-${item.type}" title="${item.name}">${item.name}</li>`)}
        </ul>
      `
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
            data: "/mass/items",
            child: [
              {
                tag: "li",
                type: "el",
                string: {
                  class: {
                    data: "[item]/type",
                    expr: "item-${_[0]}",
                  },
                  title: {
                    data: "[item]/name",
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
})

describe("сложные условные атрибуты class", () => {
  let elements: Node[]
  beforeAll(() => {
    elements = parse<{ active: boolean }>(
      ({ html, mass }) => html`<div class="div-${mass.active ? "active" : "inactive"}">Content</div>`
    )
  })
  it("data", () => {
    expect(elements).toEqual([
      {
        tag: "div",
        type: "el",
        string: {
          class: {
            data: "/mass/active",
            expr: 'div-${_[0] ? "active" : "inactive"}',
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
})
