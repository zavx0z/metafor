import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("fields/mass в атрибутах", () => {
  describe("mass с динамическими значениями", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, mass, fields }) => html`<meta-for mass=${{ id: fields.id, name: fields.name }} />`
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
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
      elements = parse(({ html, mass }) => html`<meta-for mass=${{ id: "1", name: "2" }} />`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          mass: '{ id: "1", name: "2" }',
        },
      ])
    })
  })

  describe("fields/mass во вложенных элементах", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse(
        ({ html, mass, fields }) => html`
          <div><meta-for fields=${{ id: fields.id, name: fields.name }} /></div>
        `
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
      elements = parse(
        ({ html, mass, fields }) => html`<meta-for fields=${{ id: fields.id, name: fields.name }} />`
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
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
        ({ html, mass, fields }) => html`
          <meta-for
            mass=${{ id: fields.id, name: fields.name }}
            fields=${{ id: fields.id, name: fields.name }} />
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "meta-for",
          type: "meta",
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
