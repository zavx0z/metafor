import { parse, type NodeType } from "../index.ts"
import { describe, expect, beforeAll, it } from "bun:test"

describe("text", () => {
  describe("статический", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse(
        // #region static
        ({ html }) => html`Static text`,
        // #endregion static
      )
    })
    it("data", () => {
      expect(elements).toEqual(
        // #region expectStatic
        [{ type: "text", value: "Static text" }],
        // #endregion expectStatic
      )
    })
  })
  describe("динамический", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<{ dynamic: { type: "string", required: true, default: "" } }>(
        // #region dynamic
        ({ html, value }) => html`<p>${value.dynamic}</p>`,
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
            child: [{ type: "text", data: "/value/dynamic" }],
          },
        ],
        // #endregion expectDynamic
      )
    })
  })
  describe("смешанный", () => {
    let elements: NodeType[]
    type Context = { family: { type: "string", required: true, default: "" }; name: { type: "string", required: true, default: "" } }
    beforeAll(() => {
      elements = parse<Context>(
        // #region mixed
        ({ html, value }) => html`<p>Hello, ${value.family} ${value.name}!</p>`,
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
                data: ["/value/family", "/value/name"],
                expr: "Hello, ${_[0]} ${_[1]}!",
              },
            ],
          },
        ],
        // #endregion expectMixed
      )
    })
  })
  describe("математический", () => {
    let elements: NodeType[]
    type Context = { a: { type: "number" }; b: { type: "number" } }

    beforeAll(() => {
      elements = parse<Context>(
        //#region mathematical
        ({ html, value }) => html`<p>${value.a + value.b * 2}</p>`,
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
                data: ["/value/a", "/value/b"],
                expr: "${_[0] + _[1] * 2}",
              },
            ],
          },
        ],
        //#endregion expectMathematical
      )
    })
  })

  describe("тернарный", () => {
    let elements: NodeType[]
    type Context = { flag: { type: "boolean" } }

    beforeAll(() => {
      elements = parse<Context>(
        //#region ternary
        ({ html, value }) => html`<p>${value.flag ? "Yes" : "No"}</p>`,
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
                data: "/value/flag",
                expr: '${_[0] ? "Yes" : "No"}',
              },
            ],
          },
        ],
        //#endregion expectTernary
      )
    })
  })

  describe("тернарный литерал", () => {
    let elements: NodeType[]
    type Context = { name: { type: "string" } }

    beforeAll(() => {
      elements = parse<Context>(
        //#region ternaryLiteral
        ({ html, value }) => html`<p>${value.name ? `Hi, ${value.name}!` : ""}</p>`,
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
                data: "/value/name",
                expr: '${_[0] ? `Hi, ${_[0]}!` : ""}',
              },
            ],
          },
        ],
        //#endregion expectTernaryLiteral
      )
    })
  })

  describe("логический", () => {
    let elements: NodeType[]
    type Context = { isOpen: { type: "boolean" } }

    beforeAll(() => {
      elements = parse<Context>(
        //#region logical
        ({ html, value }) => html`<p class=${value.isOpen && "open"}>${value.isOpen && "Open"}</p>`,
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
                data: "/value/isOpen",
                expr: '${_[0] && "open"}',
              },
            },
            child: [
              {
                type: "text",
                data: "/value/isOpen",
                expr: '${_[0] && "Open"}',
              },
            ],
          },
        ],
        //#endregion expectLogical
      )
    })
  })

  describe("логический литерал", () => {
    let elements: NodeType[]
    type Context = { last: { type: "string" } }

    beforeAll(() => {
      elements = parse<Context>(
        //#region logicalLiteral
        ({ html, value }) => html` <p>${value.last && `last: ${value.last}`}</p>`,
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
                data: "/value/last",
                expr: "${_[0] && `last: ${_[0]}`}",
              },
            ],
          },
        ],
        // #endregion expectLogicalLiteral
      )
    })
  })
  describe("методы", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{
        name: {
          type: "string"
          default: ""
          required: true
        }
        email: {
          type: "string"
          default: ""
          required: true
        }
      }>(
        //#region methods
        ({ html, value }) => html`<p>${value.name.toUpperCase()} - ${value.email.toLowerCase()}</p>`,
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
                data: ["/value/name", "/value/email"],
                expr: "${_[0].toUpperCase()} - ${_[1].toLowerCase()}",
              },
            ],
          },
        ],
        //#endregion expectMethods
      )
    })
  })
})
