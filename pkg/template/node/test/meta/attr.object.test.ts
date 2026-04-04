import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index.ts"

describe("value/mass в атрибутах", () => {
  describe("mass с динамическими значениями", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html`<meta-for src="test/mass-dynamic" mass=${{ id: value.id, name: value.name }} />`,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/mass-dynamic",
          mass: {
            data: ["/value/id", "/value/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
        },
      ])
    })
  })

  describe("mass со статическими значениями", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(({ html }) => html`<meta-for src="test/mass-static" mass=${{ id: "1", name: "2" }} />`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/mass-static",
          mass: '{ id: "1", name: "2" }',
        },
      ])
    })
  })

  describe("fields/mass во вложенных элементах", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html`
          <div><meta-for src="test/nested" fields=${{ id: value.id, name: value.name }} /></div>
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
              tag: "meta-for",
              type: "meta",
              src: "test/nested",
              fields: {
                data: ["/value/id", "/value/name"],
                expr: "{ id: _[0], name: _[1] }",
              },
            },
          ],
        },
      ])
    })
  })

  describe("value", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html`<meta-for src="test/fields" fields=${{ id: value.id, name: value.name }} />`,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/fields",
          fields: {
            data: ["/value/id", "/value/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
        },
      ])
    })
  })

  describe("value/mass", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, value }) => html`
          <meta-for
            src="test/both"
            mass=${{ id: value.id, name: value.name }}
            fields=${{ id: value.id, name: value.name }} />
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/both",
          mass: {
            data: ["/value/id", "/value/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
          fields: {
            data: ["/value/id", "/value/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
        },
      ])
    })
  })
})
