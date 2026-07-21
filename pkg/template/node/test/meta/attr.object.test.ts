import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("value/mass в атрибутах", () => {
  describe("energy с динамическими значениями", () => {
    it("сохраняет отдельный Energy binding", () => {
      expect(parse(
        ({html, energy}) => html`<meta-for src="test/energy-dynamic" energy=${{socket: energy.socket}} />`,
      )).toEqual([
        {
          tag: "meta-for",
          type: "meta",
          src: "test/energy-dynamic",
          energy: {
            data: "/energy/socket",
            expr: "{ socket: _[0] }",
          },
        },
      ])
    })

    it("сохраняет прямые aliases полных Mass и Energy stores", () => {
      expect(parse(
        ({html, mass, energy}) => html`<meta-for src="test/runtime-aliases" mass=${mass} energy=${energy} />`,
      )).toEqual([{
        tag: "meta-for",
        type: "meta",
        src: "test/runtime-aliases",
        mass: {data: "/mass"},
        energy: {data: "/energy"},
      }])
    })
  })

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
