import { describe, expect, it } from "bun:test"
import { View } from "../index.ts"

describe("meta", () => {
  const html = String.raw

  describe("теги", () => {
    describe("актор web-component", () => {
      const view = new View({
        render: ({ html }) => html`<meta-hash></meta-hash>`,
      })
      it("парсинг", () => {
        expect(view.schema, "актор web-component").toEqual([
          {
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it("рендер", () => {
        const container = document.createElement("div")
        view.render({ container })
        expect(container.innerHTML).toMatchStringHTML(html`<meta-hash></meta-hash>`)
      })
    })

    describe("актор web-component с самозакрывающимся тегом", () => {
      const view = new View({
        render: ({ html }) => html`<meta-hash />`,
      })
      it("парсинг", () => {
        expect(view.schema, "актор web-component с самозакрывающимся тегом").toEqual([
          {
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it("рендер", () => {
        const container = document.createElement("div")
        view.render({ container })
        expect(container.innerHTML).toMatchStringHTML(html`<meta-hash />`)
      })
    })

    describe("хеш-тег из core в самозакрывающемся теге", () => {
      const view = new View({
        render: ({ html, core }) => html`<meta-${core.actors.child} />`,
      })
      it("парсинг", () => {
        expect(view.schema, "хеш-тег из core").toEqual([
          {
            tag: {
              data: "/core/actors/child",
              expr: "meta-${[0]}",
            },
            type: "meta",
          },
        ])
      })
      it("рендер", () => {
        const core = {
          actors: {
            child: "child",
          },
        }
        const container = document.createElement("div")
        view.render({ container, core })
        expect(container.innerHTML).toMatchStringHTML(html`<meta-${core.actors.child} />`)
      })
    })

    describe("хеш-тег из core", () => {
      const view = new View({
        render: ({ html, core }) => html`<meta-${core.actors.child}></meta-${core.actors.child}>`,
      })
      it("парсинг", () => {
        expect(view.schema, "хеш-тег из core").toEqual([
          {
            tag: {
              data: "/core/actors/child",
              expr: "meta-${[0]}",
            },
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("meta-элемент с хеш-тегом из core и с передачей контекста", () => {
      const view = new View({
        render: ({ html, context, core }) => html`
          <meta-${core.actors.child}
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }} />
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "meta-элемент с хеш-тегом из core и с передачей контекста").toEqual([
          {
            object: {
              context: {
                count: "/context/parentCount",
                message: "/context/parentMessage",
              },
            },
            tag: {
              data: "/core/actors/child",
              expr: "meta-${[0]}",
            },
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("объекты в атрибутах", () => {
    describe("интерполяция объекта context", () => {
      const view = new View({
        render: ({ html, context }) => html`
          <meta-hash
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }} />
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "интерполяция объекта context").toEqual([
          {
            object: {
              context: {
                count: "/context/parentCount",
                message: "/context/parentMessage",
              },
            },
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("интерполяция объекта core", () => {
      const view = new View({
        render: ({ html, core }) => html`
          <meta-hash
            core=${{
              socket: core.socket,
              apiService: core.apiService,
            }} />
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "интерполяция объекта core").toEqual([
          {
            object: {
              core: {
                apiService: "/core/apiService",
                socket: "/core/socket",
              },
            },
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("смешанные объекты context и core", () => {
      const view = new View({
        render: ({ html, context, core }) => html`
          <meta-hash
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }}
            core=${{
              socket: core.socket,
              apiService: core.apiService,
            }} />
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "смешанные объекты context и core").toEqual([
          {
            object: {
              context: {
                count: "/context/parentCount",
                message: "/context/parentMessage",
              },
              core: {
                apiService: "/core/apiService",
                socket: "/core/socket",
              },
            },
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("вложенные meta-элементы", () => {
    describe("meta-элемент внутри обычного элемента", () => {
      const view = new View({
        render: ({ html, context, core }) => html`
          <div class="container">
            <meta-${core.actors.child} context=${{ message: context.parentMessage }} />
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "meta-элемент внутри обычного элемента").toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: "container",
            },
            child: [
              {
                tag: {
                  data: "/core/actors/child",
                  expr: "meta-${[0]}",
                },
                type: "meta",
              },
            ],
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("несколько meta-элементов", () => {
      const view = new View({
        render: ({ html, context, core }) => html`
          <div class="container">
            <meta-${core.actors.child1} context=${{ message: context.message1 }} />
            <meta-${core.actors.child2} context=${{ message: context.message2 }} />
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "несколько meta-элементов").toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: "container",
            },
            child: [
              {
                tag: {
                  data: "/core/actors/child1",
                  expr: "meta-${[0]}",
                },
                type: "meta",
              },
              {
                tag: {
                  data: "/core/actors/child2",
                  expr: "meta-${[0]}",
                },
                type: "meta",
              },
            ],
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("edge cases", () => {
    describe("meta-элемент без атрибутов", () => {
      const view = new View({
        render: ({ html }) => html`<meta-hash />`,
      })
      it("парсинг", () => {
        expect(view.schema, "meta-элемент без атрибутов").toEqual([
          {
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("meta-элемент с пустыми объектами", () => {
      const view = new View({
        render: ({ html }) => html` <meta-hash context=${{}} core=${{}} /> `,
      })
      it("парсинг", () => {
        expect(view.schema, "meta-элемент с пустыми объектами").toEqual([
          {
            object: {
              context: {
                context: "{}",
              },
              core: {
                core: "{}",
              },
            },
            tag: "meta-hash",
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })

    describe("meta-элемент с динамическим тегом и статическими атрибутами", () => {
      const view = new View({
        render: ({ html, core }) => html` <meta-${core.actors.child} class="static-class" data-test="static-data" /> `,
      })
      it("парсинг", () => {
        expect(view.schema, "meta-элемент с динамическим тегом и статическими атрибутами").toEqual([
          {
            string: {
              class: "static-class",
              "data-test": "static-data",
            },
            tag: {
              data: "/core/actors/child",
              expr: "meta-${[0]}",
            },
            type: "meta",
          },
        ])
      })
      it.skip("рендер", () => {})
    })
  })

  describe("динамические теги", () => {
    it("нелегальная динамика - не meta-* тег", () => {
      const view = new View({
        render: ({ html, context }) => html`<x-${context.kind} />`,
      })
      const container = document.createElement("div")
      view.render({ container, context: { kind: "box" } })
      expect(container.innerHTML).toMatchStringHTML("&lt;x-box /&gt;")
    })

    it("нелегальная динамика - не meta-* тег в map", () => {
      const core = { actors: [{ name: "a" }, { name: "b" }] }
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`${core.actors.map((a) => html`<actor-${a.name} />`)}`,
      })
      const container = document.createElement("div")
      view.render({ container, core })
      expect(container.innerHTML).toMatchStringHTML("")
    })

    it("легальная динамика - meta-* тег", () => {
      const view = new View({
        render: ({ html, context }) => html`<meta-${context.kind} />`,
      })
      const container = document.createElement("div")
      view.render({ container, context: { kind: "child" } })
      expect(container.innerHTML).toMatchStringHTML("<meta-child></meta-child>")
    })

    it("meta-* не void тег", () => {
      const view = new View({
        render: ({ html }) => html`<meta-child />`,
      })
      const container = document.createElement("div")
      view.render({ container })
      expect(container.innerHTML).toMatchStringHTML("<meta-child></meta-child>")
    })
  })
})
