import { describe, expect, it, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("meta", () => {
  describe("теги", () => {
    describe("актор web-component", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html }) => html`<meta-for src="org/repo"></meta-for>`)
      })

      it("hierarchy", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
          },
        ])
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
          },
        ])
      })
    })

    describe("актор web-component с самозакрывающимся тегом", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html }) => html`<meta-for src="org/repo" />`)
      })
      it("hierarchy", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
          },
        ])
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
          },
        ])
      })
    })

    describe("хеш-тег из core в самозакрывающемся теге", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html, mass }) => html`<meta-for src="org/repo" />`)
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
          },
        ])
      })
    })

    describe("хеш-тег из core", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html, mass }) => html`<meta-for src="org/repo"></meta-for>`)
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
          },
        ])
      })
    })

    describe("meta-тег в простом элементе", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html, mass }) => html`<div><meta-for src="org/repo" /></div>`)
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
                src: "org/repo",
              },
            ],
          },
        ])
      })
    })

    describe("meta-тег в meta-теге", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html, mass }) => html`<meta-for src="org/parent"><meta-for src="org/child" /></meta-for>`)
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/parent",
            child: [
              {
                tag: "meta-for",
                type: "meta",
                src: "org/child",
              },
            ],
          },
        ])
      })
    })

    describe("meta-тег в map", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, { items: { tag: string }[] }>(
          ({ html, mass }) => html`${mass.items.map((item) => html`<meta-for src="org/repo" />`)}`
        )
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            type: "map",
            data: "/mass/items",
            child: [
              {
                tag: "meta-for",
                type: "meta",
                src: "org/repo",
              },
            ],
          },
        ])
      })
    })

    describe("meta-тег в тренарном операторе", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(
          ({ html, mass }) => html`${mass.items.length > 0 ? html`<meta-for src="org/true" />` : html`<meta-for src="org/false" />`}`
        )
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            type: "cond",
            data: "/mass/items/length",
            expr: "_[0] > 0",
            child: [
              {
                tag: "meta-for",
                type: "meta",
                src: "org/true",
              },
              {
                tag: "meta-for",
                type: "meta",
                src: "org/false",
              },
            ],
          },
        ])
      })
    })
  })

  describe("атрибуты", () => {
    describe("статические атрибуты", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html }) => html`<meta-for src="org/repo" data-type="component" class="meta-element" />`)
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
            string: {
              "data-type": "component",
              class: "meta-element",
            },
          },
        ])
      })
    })

    describe("динамические атрибуты", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(({ html, mass }) => html`<meta-for src="org/repo" data-id="${mass.id}" class="meta-${mass.type}" />`)
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
            string: {
              "data-id": {
                data: "/mass/id",
              },
              class: {
                data: "/mass/type",
                expr: "meta-${_[0]}",
              },
            },
          },
        ])
      })
    })

    describe("условные атрибуты", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(
          ({ html, mass }) => html`
            <meta-for src="org/repo" ${mass.active && "data-active"} class="${mass.active ? "active" : "inactive"}" />
          `
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
            string: {
              class: {
                data: "/mass/active",
                expr: '${_[0] ? "active" : "inactive"}',
              },
            },
            boolean: {
              "data-active": {
                data: "/mass/active",
              },
            },
          },
        ])
      })
    })

    describe("события", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(
          ({ html, mass }) => html`
            <meta-for src="org/repo"
              onclick=${() => mass.handleClick(mass.id)}
              onchange=${(e: Event) => mass.handleChange(e, mass.value)} />
          `
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
            event: {
              onclick: {
                data: ["/mass/handleClick", "/mass/id"],
                expr: "() => _[0](_[1])",
              },
              onchange: {
                data: ["/mass/handleChange", "/mass/value"],
                expr: "(e) => _[0](e, _[1])",
              },
            },
          },
        ])
      })
    })

    describe("функция update", () => {
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse(
          ({ html, mass, update }) => html`<meta-for src="org/repo" onclick=${() => update({ selected: mass.id })} />`
        )
      })

      it("data", () => {
        expect(elements).toEqual([
          {
            tag: "meta-for",
            type: "meta",
            src: "org/repo",
            event: {
              onclick: {
                data: "/mass/id",
                expr: "() => update({ selected: _[0] })",
                upd: "selected",
              },
            },
          },
        ])
      })
    })

    describe("смешанные атрибуты", () => {
      type Core = {
        items: { tag: string; id: string; active: boolean; handleClick: (id: string) => void }[]
      }
      let elements: NodeType[]

      beforeAll(() => {
        elements = parse<any, Core>(
          ({ html, mass }) => html`
            ${mass.items.map(
              (item) => html`
                <meta-for src="org/repo"
                  data-id="${item.id}"
                  ${item.active && "data-active"}
                  class="meta-${item.active ? "active" : "inactive"}"
                  onclick=${() => item.handleClick(item.id)} />
              `
            )}
          `
        )
      })
      it("data", () => {
        expect(elements).toEqual([
          {
            type: "map",
            data: "/mass/items",
            child: [
              {
                tag: "meta-for",
                type: "meta",
                src: "org/repo",
                string: {
                  "data-id": {
                    data: "[item]/id",
                  },
                  class: {
                    data: "[item]/active",
                    expr: 'meta-${_[0] ? "active" : "inactive"}',
                  },
                },
                event: {
                  onclick: {
                    data: ["[item]/handleClick", "[item]/id"],
                    expr: "() => _[0](_[1])",
                  },
                },
                boolean: {
                  "data-active": {
                    data: "[item]/active",
                  },
                },
              },
            ],
          },
        ])
      })
    })
  })
})
