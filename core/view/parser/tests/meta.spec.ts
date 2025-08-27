import { describe, expect, it } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("meta", () => {
  describe("теги", () => {
    describe("актор web-component", () => {
      const mainHtml = extractMainHtmlBlock(({ html }) => html`<meta-hash></meta-hash>`)

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          { text: "<meta-hash>", index: 0, name: "meta-hash", kind: "open" },
          { text: "</meta-hash>", index: 11, name: "meta-hash", kind: "close" },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            text: "<meta-hash>",
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
    })

    describe("актор web-component с самозакрывающимся тегом", () => {
      const mainHtml = extractMainHtmlBlock(({ html }) => html`<meta-hash />`)

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([{ text: "<meta-hash />", index: 0, name: "meta-hash", kind: "self" }])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            text: "<meta-hash />",
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
    })

    describe("хеш-тег из core в самозакрывающемся теге", () => {
      const mainHtml = extractMainHtmlBlock(({ html, core }) => html`<meta-${core.actors.child} />`)

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          { text: "<meta-${core.actors.child} />", index: 0, name: "meta-${core.actors.child}", kind: "self" },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-${core.actors.child}",
            type: "meta",
            text: "<meta-${core.actors.child} />",
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: {
              data: "/core/actors/child",
              expr: "meta-${0}",
            },
            type: "meta",
          },
        ])
      })
    })

    describe("хеш-тег из core", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html, core }) => html`<meta-${core.actors.child}></meta-${core.actors.child}>`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          { text: "<meta-${core.actors.child}>", index: 0, name: "meta-${core.actors.child}", kind: "open" },
          { text: "</meta-${core.actors.child}>", index: 27, name: "meta-${core.actors.child}", kind: "close" },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-${core.actors.child}",
            type: "meta",
            text: "<meta-${core.actors.child}>",
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: {
              data: "/core/actors/child",
              expr: "meta-${0}",
            },
            type: "meta",
          },
        ])
      })
    })

    describe("meta-тег в простом элементе", () => {
      const mainHtml = extractMainHtmlBlock(({ html, core }) => html`<div><meta-${core.tag} /></div>`)

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          { text: "<div>", index: 0, name: "div", kind: "open" },
          { text: "<meta-${core.tag} />", index: 5, name: "meta-${core.tag}", kind: "self" },
          { text: "</div>", index: 25, name: "div", kind: "close" },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "div",
            type: "el",
            text: "<div>",
            child: [
              {
                tag: "meta-${core.tag}",
                type: "meta",
                text: "<meta-${core.tag} />",
              },
            ],
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: {
                  data: "/core/tag",
                  expr: "meta-${0}",
                },
                type: "meta",
              },
            ],
          },
        ])
      })
    })

    describe("meta-тег в meta-теге", () => {
      const mainHtml = extractMainHtmlBlock(({ html, core }) => html`<meta-hash><meta-${core.tag} /></meta-hash>`)

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          { text: "<meta-hash>", index: 0, name: "meta-hash", kind: "open" },
          { text: "<meta-${core.tag} />", index: 11, name: "meta-${core.tag}", kind: "self" },
          { text: "</meta-hash>", index: 31, name: "meta-hash", kind: "close" },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            text: "<meta-hash>",
            child: [
              {
                tag: "meta-${core.tag}",
                type: "meta",
                text: "<meta-${core.tag} />",
              },
            ],
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            child: [
              {
                tag: {
                  data: "/core/tag",
                  expr: "meta-${0}",
                },
                type: "meta",
              },
            ],
          },
        ])
      })
    })

    describe("meta-тег в map", () => {
      const mainHtml = extractMainHtmlBlock<any, { items: { tag: string }[] }>(
        ({ html, core }) => html`${core.items.map((item) => html`<meta-${item.tag} />`)}`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([{ text: "<meta-${item.tag} />", index: 32, name: "meta-${item.tag}", kind: "self" }])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            type: "map",
            text: "core.items.map((item)`",
            child: [
              {
                tag: "meta-${item.tag}",
                type: "meta",
                text: "<meta-${item.tag} />",
              },
            ],
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            type: "map",
            data: "/core/items",
            child: [
              {
                tag: {
                  data: "[item]/tag",
                  expr: "meta-${0}",
                },
                type: "meta",
              },
            ],
          },
        ])
      })
    })

    describe("meta-тег в тренарном операторе", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html, core }) => html`${core.items.length > 0 ? html`<meta-${core.tag} />` : html`<meta-${core.tag} />`}`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          { text: "<meta-${core.tag} />", index: 31, name: "meta-${core.tag}", kind: "self" },
          { text: "<meta-${core.tag} />", index: 60, name: "meta-${core.tag}", kind: "self" },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            type: "cond",
            text: "core.items.length > 0",
            true: {
              tag: "meta-${core.tag}",
              type: "meta",
              text: "<meta-${core.tag} />",
            },
            false: {
              tag: "meta-${core.tag}",
              type: "meta",
              text: "<meta-${core.tag} />",
            },
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            type: "cond",
            data: "/core/items/length",
            expr: "${0} > 0",
            true: {
              tag: {
                data: "/core/tag",
                expr: "meta-${0}",
              },
              type: "meta",
            },
            false: {
              tag: {
                data: "/core/tag",
                expr: "meta-${0}",
              },
              type: "meta",
            },
          },
        ])
      })
    })
  })

  describe("атрибуты", () => {
    describe("статические атрибуты", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html }) => html`<meta-hash data-type="component" class="meta-element" />`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          {
            text: '<meta-hash data-type="component" class="meta-element" />',
            index: 0,
            name: "meta-hash",
            kind: "self",
          },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            text: '<meta-hash data-type="component" class="meta-element" />',
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      it("attributes", () => {
        expect(attributes).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            string: {
              "data-type": {
                type: "static",
                value: "component",
              },
              class: {
                type: "static",
                value: "meta-element",
              },
            },
          },
        ])
      })

      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: "meta-hash",
            type: "meta",
            string: {
              "data-type": "component",
              class: "meta-element",
            },
          },
        ])
      })
    })

    describe("динамические атрибуты", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html, core }) => html`<meta-${core.tag} data-id="${core.id}" class="meta-${core.type}" />`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          {
            text: '<meta-${core.tag} data-id="${core.id}" class="meta-${core.type}" />',
            index: 0,
            name: "meta-${core.tag}",
            kind: "self",
          },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-${core.tag}",
            type: "meta",
            text: '<meta-${core.tag} data-id="${core.id}" class="meta-${core.type}" />',
          },
        ])
      })
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: {
              data: "/core/tag",
              expr: "meta-${0}",
            },
            type: "meta",
            string: {
              "data-id": {
                data: "/core/id",
              },
              class: {
                data: "/core/type",
                expr: "meta-${0}",
              },
            },
          },
        ])
      })
    })

    describe("условные атрибуты", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html, core }) =>
          html`<meta-${core.tag} ${core.active && "data-active"} class="${core.active ? "active" : "inactive"}" />`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          {
            text: '<meta-${core.tag} ${core.active && "data-active"} class="${core.active ? "active" : "inactive"}" />',
            index: 0,
            name: "meta-${core.tag}",
            kind: "self",
          },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-${core.tag}",
            type: "meta",
            text: '<meta-${core.tag} ${core.active && "data-active"} class="${core.active ? "active" : "inactive"}" />',
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: {
              data: "/core/tag",
              expr: "meta-${0}",
            },
            type: "meta",
            boolean: {
              "data-active": {
                data: "/core/active",
              },
            },
            string: {
              class: {
                data: "/core/active",
                expr: '${0} ? "active" : "inactive"',
              },
            },
          },
        ])
      })
    })

    describe("события", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html, core }) =>
          html`<meta-${core.tag}
            onclick=${() => core.handleClick(core.id)}
            onchange=${(e: any) => core.handleChange(e, core.value)} />`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          {
            text: "<meta-${core.tag}\n            onclick=${() => core.handleClick(core.id)}\n            onchange=${(e) => core.handleChange(e, core.value)} />",
            index: 0,
            name: "meta-${core.tag}",
            kind: "self",
          },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-${core.tag}",
            type: "meta",
            text: "<meta-${core.tag}\n            onclick=${() => core.handleClick(core.id)}\n            onchange=${(e) => core.handleChange(e, core.value)} />",
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: {
              data: "/core/tag",
              expr: "meta-${0}",
            },
            type: "meta",
            event: {
              onclick: {
                data: ["/core/handleClick", "/core/id"],
                expr: "() => ${0}(${1})",
              },
              onchange: {
                data: ["/core/handleChange", "/core/value"],
                expr: "(e) => ${0}(e, ${1})",
              },
            },
          },
        ])
      })
    })

    describe("функция update", () => {
      const mainHtml = extractMainHtmlBlock(
        ({ html, core, update }) => html`<meta-${core.tag} onclick=${() => update({ selected: core.id })} />`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          {
            text: "<meta-${core.tag} onclick=${() => update({ selected: core.id })} />",
            index: 0,
            name: "meta-${core.tag}",
            kind: "self",
          },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            tag: "meta-${core.tag}",
            type: "meta",
            text: "<meta-${core.tag} onclick=${() => update({ selected: core.id })} />",
          },
        ])
      })

      const attributes = extractAttributes(hierarchy)
      it("attributes", () =>
        expect(attributes).toEqual([
          {
            tag: "meta-${core.tag}",
            type: "meta",
            event: {
              onclick: "() => update({ selected: core.id })",
            },
          },
        ]))

      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            tag: {
              data: "/core/tag",
              expr: "meta-${0}",
            },
            type: "meta",
            event: {
              onclick: {
                data: "/core/id",
                expr: "() => update({ selected: ${0} })",
                upd: "selected",
              },
            },
          },
        ])
      })
    })

    describe("смешанные атрибуты", () => {
      const mainHtml = extractMainHtmlBlock<
        any,
        { items: { tag: string; id: string; active: boolean; handleClick: (id: string) => void }[] }
      >(
        ({ html, core }) =>
          html`${core.items.map(
            (item) =>
              html`<meta-${item.tag}
                data-id="${item.id}"
                ${item.active && "data-active"}
                class="meta-${item.active ? "active" : "inactive"}"
                onclick=${() => item.handleClick(item.id)} />`
          )}`
      )

      const elements = extractHtmlElements(mainHtml)
      it("elements", () => {
        expect(elements).toEqual([
          {
            text: '<meta-${item.tag}\n                data-id="${item.id}"\n                ${item.active && "data-active"}\n                class="meta-${item.active ? "active" : "inactive"}"\n                onclick=${() => item.handleClick(item.id)} />',
            index: 32,
            name: "meta-${item.tag}",
            kind: "self",
          },
        ])
      })

      const hierarchy = makeHierarchy(mainHtml, elements)
      it("hierarchy", () => {
        expect(hierarchy).toEqual([
          {
            type: "map",
            text: "core.items.map((item)`",
            child: [
              {
                tag: "meta-${item.tag}",
                type: "meta",
                text: '<meta-${item.tag}\n                data-id="${item.id}"\n                ${item.active && "data-active"}\n                class="meta-${item.active ? "active" : "inactive"}"\n                onclick=${() => item.handleClick(item.id)} />',
              },
            ],
          },
        ])
      })
      const attributes = extractAttributes(hierarchy)
      it("attributes", () => {
        expect(attributes).toEqual([
          {
            type: "map",
            text: "core.items.map((item)`",
            child: [
              {
                tag: "meta-${item.tag}",
                type: "meta",
                string: {
                  "data-id": {
                    type: "dynamic",
                    value: "item.id",
                  },
                  class: {
                    type: "mixed",
                    value: 'meta-${item.active ? "active" : "inactive"}',
                  },
                },
                boolean: {
                  "data-active": {
                    type: "dynamic",
                    value: "item.active",
                  },
                },
                event: {
                  onclick: "() => item.handleClick(item.id)",
                },
              },
            ],
          },
        ])
      })

      const data = enrichWithData(attributes)
      it("data", () => {
        expect(data).toEqual([
          {
            type: "map",
            data: "/core/items",
            child: [
              {
                tag: {
                  data: "[item]/tag",
                  expr: "meta-${0}",
                },
                type: "meta",
                event: {
                  onclick: {
                    data: ["[item]/handleClick", "[item]/id"],
                    expr: "() => ${0}(${1})",
                  },
                },
                string: {
                  "data-id": {
                    data: "[item]/id",
                  },
                  class: {
                    data: "[item]/active",
                    expr: 'meta-${0 ? "active" : "inactive"}',
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
