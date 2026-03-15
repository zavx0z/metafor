import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("fields/mass в атрибутах", () => {
  describe("mass с динамическими значениями", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(({ html, fields }) => html`<meta-for src="test/mass-dynamic" mass=${{ id: fields.id, name: fields.name }} />`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/mass-dynamic",
          mass: {
            data: ["/fields/id", "/fields/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
        },
      ])
    })
  })

  describe("mass со статическими значениями", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(({ html, mass }) => html`<meta-for src="test/mass-static" mass=${{ id: "1", name: "2" }} />`)
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
        ({ html, mass, fields }) => html` <div><meta-for src="test/nested" fields=${{ id: fields.id, name: fields.name }} /></div> `,
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
                data: ["/fields/id", "/fields/name"],
                expr: "{ id: _[0], name: _[1] }",
              },
            },
          ],
        },
      ])
    })
  })

  describe("fields", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(({ html, mass, fields }) => html`<meta-for src="test/fields" fields=${{ id: fields.id, name: fields.name }} />`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/fields",
          fields: {
            data: ["/fields/id", "/fields/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
        },
      ])
    })
  })

  describe("fields/mass", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, fields }) => html`
          <meta-for src="test/both" mass=${{ id: fields.id, name: fields.name }} fields=${{ id: fields.id, name: fields.name }} />
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
            data: ["/fields/id", "/fields/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
          fields: {
            data: ["/fields/id", "/fields/name"],
            expr: "{ id: _[0], name: _[1] }",
          },
        },
      ])
    })
  })
})
