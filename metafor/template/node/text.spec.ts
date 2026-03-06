import { parse, type NodeType } from "../index"
import { describe, expect, beforeAll, it } from "bun:test"

describe("text", () => {
  describe("статический", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse(
        // #region static
        ({ html }) => html`Static text`
        // #endregion static
      )
    })
    it("data", () => {
      expect(elements).toEqual(
        // #region expectStatic
        [{ type: "text", value: "Static text" }]
        // #endregion expectStatic
      )
    })
  })
  describe("динамический", () => {
    let elements: NodeType[]
    type Context = { dynamic: string }
    beforeAll(() => {
      elements = parse<Context>(
        // #region dynamic
        ({ html, fields }) => html`<p>${fields.dynamic}</p>`
        // #endregion dynamic
      )
    })
    it("data", () => {
      expect(elements).toEqual(
        // #region expectDynamic
        [
          {
            tag: "p",
            type: "el",
            child: [{ type: "text", data: "/fields/dynamic" }],
          },
        ]
        // #endregion expectDynamic
      )
    })
  })
  describe("смешанный", () => {
    let elements: NodeType[]
    type Context = { family: string; name: string }
    beforeAll(() => {
      elements = parse<Context>(
        // #region mixed
        ({ html, fields }) => html`<p>Hello, ${fields.family} ${fields.name}!</p>`
        // #endregion mixed
      )
    })
    it("data", () => {
      expect(elements).toEqual(
        // #region expectMixed
        [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: ["/fields/family", "/fields/name"],
                expr: "Hello, ${_[0]} ${_[1]}!",
              },
            ],
          },
        ]
        // #endregion expectMixed
      )
    })
  })
  describe("математический", () => {
    let elements: NodeType[]
    type Context = { a: number; b: number }

    beforeAll(() => {
      elements = parse<Context>(
        //#region mathematical
        ({ html, fields }) => html`<p>${fields.a + fields.b * 2}</p>`
        //#endregion mathematical
      )
    })

    it("expr", () => {
      expect(elements).toEqual(
        //#region expectMathematical
        [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: ["/fields/a", "/fields/b"],
                expr: "${_[0] + _[1] * 2}",
              },
            ],
          },
        ]
        //#endregion expectMathematical
      )
    })
  })

  describe("тернарный", () => {
    let elements: NodeType[]
    type Context = { flag: boolean }

    beforeAll(() => {
      elements = parse<Context>(
        //#region ternary
        ({ html, fields }) => html`<p>${fields.flag ? "Yes" : "No"}</p>`
        //#endregion ternary
      )
    })

    it("expr", () => {
      expect(elements).toEqual(
        //#region expectTernary
        [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/fields/flag",
                expr: '${_[0] ? "Yes" : "No"}',
              },
            ],
          },
        ]
        //#endregion expectTernary
      )
    })
  })

  describe("тернарный литерал", () => {
    let elements: NodeType[]
    type Context = { name: string }

    beforeAll(() => {
      elements = parse<Context>(
        //#region ternaryLiteral
        ({ html, fields }) => html`<p>${fields.name ? `Hi, ${fields.name}!` : ""}</p>`
        //#endregion ternaryLiteral
      )
    })

    it("expr", () => {
      expect(elements).toEqual(
        //#region expectTernaryLiteral
        [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/fields/name",
                expr: '${_[0] ? `Hi, ${_[0]}!` : ""}',
              },
            ],
          },
        ]
        //#endregion expectTernaryLiteral
      )
    })
  })

  describe("логический", () => {
    let elements: NodeType[]
    type Context = { isOpen: boolean }

    beforeAll(() => {
      elements = parse<Context>(
        //#region logical
        ({ html, fields }) => html`<p class=${fields.isOpen && "open"}>${fields.isOpen && "Open"}</p>`
        //#endregion logical
      )
    })

    it("expr", () => {
      expect(elements).toEqual(
        //#region expectLogical
        [
          {
            tag: "p",
            type: "el",
            string: {
              class: {
                data: "/fields/isOpen",
                expr: '${_[0] && "open"}',
              },
            },
            child: [
              {
                type: "text",
                data: "/fields/isOpen",
                expr: '${_[0] && "Open"}',
              },
            ],
          },
        ]
        //#endregion expectLogical
      )
    })
  })

  describe("логический литерал", () => {
    let elements: NodeType[]
    type Context = { last: string }

    beforeAll(() => {
      elements = parse<Context>(
        //#region logicalLiteral
        ({ html, fields }) => html` <p>${fields.last && `last: ${fields.last}`}</p>`
        //#endregion logicalLiteral
      )
    })
    it("expr", () => {
      expect(elements).toEqual(
        // #region expectLogicalLiteral
        [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/fields/last",
                expr: "${_[0] && `last: ${_[0]}`}",
              },
            ],
          },
        ]
        // #endregion expectLogicalLiteral
      )
    })
  })
  describe("методы", () => {
    let elements: NodeType[]
    type Context = { name: string; email: string }

    beforeAll(() => {
      elements = parse<Context>(
        //#region methods
        ({ html, fields }) => html`<p>${fields.name.toUpperCase()} - ${fields.email.toLowerCase()}</p>`
        //#endregion methods
      )
    })

    it("data", () => {
      expect(elements).toEqual(
        //#region expectMethods
        [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: ["/fields/name", "/fields/email"],
                expr: "${_[0].toUpperCase()} - ${_[1].toLowerCase()}",
              },
            ],
          },
        ]
        //#endregion expectMethods
      )
    })
  })
})
