import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../../splitter"
import { makeHierarchy } from "../../hierarchy"
import { enrichWithData } from "../../data"
import { extractAttributes } from "../../attributes"

describe("class атрибуты в data.ts", () => {
  describe("простые случаи", () => {
    it("class в элементе с одним статическим значением", () => {
      const mainHtml = extractMainHtmlBlock(({ html }) => html`<div class="div-active"></div>`)
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: "div-active",
          },
        },
      ])
    })

    it("class в элементе с одним статическим значением без кавычек", () => {
      const mainHtml = extractMainHtmlBlock(({ html }) => html`<div class="div-active"></div>`)
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: "div-active",
          },
        },
      ])
    })

    it("class в элементе с несколькими статическими значениями", () => {
      const mainHtml = extractMainHtmlBlock(({ html }) => html`<div class="div-active div-inactive"></div>`)
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [{ value: "div-active" }, { value: "div-inactive" }],
          },
        },
      ])
    })
  })

  describe("динамические значения", () => {
    it("class в элементе с одним динамическим значением", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="${core.active ? "active" : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: '${0} ? "active" : "inactive"',
            },
          },
        },
      ])
    })

    it("class в элементе с одним динамическим значением без кавычек", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class=${core.active ? "active" : "inactive"}></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: '${0} ? "active" : "inactive"',
            },
          },
        },
      ])
    })

    it("class в элементе с несколькими динамическими значениями", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) =>
          html`<div class="${core.active ? "active" : "inactive"} ${core.active ? "active" : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              {
                data: "/core/active",
                expr: '${0} ? "active" : "inactive"',
              },
              {
                data: "/core/active",
                expr: '${0} ? "active" : "inactive"',
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с операторами сравнения", () => {
      const mainHtml = extractMainHtmlBlock<{ count: number }>(
        ({ html, core }) => html`<div class="${core.count > 5 ? "large" : "small"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/count",
              expr: '${0} > 5 ? "large" : "small"',
            },
          },
        },
      ])
    })

    it("class в элементе с операторами равенства", () => {
      const mainHtml = extractMainHtmlBlock<{ status: string }>(
        ({ html, core }) => html`<div class="${core.status === "loading" ? "loading" : "ready"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/status",
              expr: '${0} === "loading" ? "loading" : "ready"',
            },
          },
        },
      ])
    })

    it("class в элементе с логическими операторами", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean; visible: boolean }>(
        ({ html, core }) => html`<div class="${core.active && core.visible ? "show" : "hide"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/core/active", "/core/visible"],
              expr: '${0} && ${1} ? "show" : "hide"',
            },
          },
        },
      ])
    })

    it("class в элементе с оператором ИЛИ", () => {
      const mainHtml = extractMainHtmlBlock<{ error: boolean; warning: boolean }>(
        ({ html, core }) => html`<div class="${core.error || core.warning ? "alert" : "normal"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/core/error", "/core/warning"],
              expr: '${0} || ${1} ? "alert" : "normal"',
            },
          },
        },
      ])
    })

    it("class в элементе с оператором НЕ", () => {
      const mainHtml = extractMainHtmlBlock<{ disabled: boolean }>(
        ({ html, core }) => html`<div class="${!core.disabled ? "enabled" : "disabled"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/disabled",
              expr: '!${0} ? "enabled" : "disabled"',
            },
          },
        },
      ])
    })

    it("class в элементе с оператором И &&", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="${core.active && "active"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: '${0} && "active"',
            },
          },
        },
      ])
    })
  })

  describe("смешанные значения", () => {
    it("class в элементе с одним смешанным значением", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="div-${core.active ? "active" : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: 'div-${0 ? "active" : "inactive"}',
            },
          },
        },
      ])
    })

    it("class в элементе с одним смешанным значением без кавычек", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="div-${core.active ? "active" : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: 'div-${0 ? "active" : "inactive"}',
            },
          },
        },
      ])
    })

    it("class в элементе с несколькими смешанными значениями", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) =>
          html`<div
            class="div-${core.active ? "active" : "inactive"} div-${core.active ? "active" : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              {
                data: "/core/active",
                expr: 'div-${0 ? "active" : "inactive"}',
              },
              {
                data: "/core/active",
                expr: 'div-${0 ? "active" : "inactive"}',
              },
            ],
          },
        },
      ])
    })
  })

  describe("различные варианты", () => {
    it("class в элементе с смешанным и статическим значениями", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="div-${core.active ? "active" : "inactive"} visible"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              {
                data: "/core/active",
                expr: 'div-${0 ? "active" : "inactive"}',
              },
              { value: "visible" },
            ],
          },
        },
      ])
    })

    it("class в элементе с динамическим и статическим значениями", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="${core.active ? "active" : "inactive"} visible"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              {
                data: "/core/active",
                expr: '${0} ? "active" : "inactive"',
              },
              { value: "visible" },
            ],
          },
        },
      ])
    })

    it("class в элементе с тремя различными типами значений", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean; type: string }>(
        ({ html, core }) =>
          html`<div class="static-value ${core.active ? "active" : "inactive"} mixed-${core.type}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              { value: "static-value" },
              {
                data: "/core/active",
                expr: '${0} ? "active" : "inactive"',
              },
              {
                data: "/core/type",
                expr: "mixed-${0}",
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с несколькими смешанными значениями", () => {
      const mainHtml = extractMainHtmlBlock<{ variant: string; size: string; theme: string }>(
        ({ html, core }) => html`<div class="btn-${core.variant} text-${core.size} bg-${core.theme}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              {
                data: "/core/variant",
                expr: "btn-${0}",
              },
              {
                data: "/core/size",
                expr: "text-${0}",
              },
              {
                data: "/core/theme",
                expr: "bg-${0}",
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с условными классами", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean; disabled: boolean }>(
        ({ html, core }) =>
          html`<div class="base-class ${core.active ? "active" : "inactive"} ${core.disabled ? "disabled" : ""}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              { value: "base-class" },
              {
                data: "/core/active",
                expr: '${0} ? "active" : "inactive"',
              },
              {
                data: "/core/disabled",
                expr: '${0} ? "disabled" : ""',
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с вложенными выражениями", () => {
      const mainHtml = extractMainHtmlBlock<{ nested: boolean }>(
        ({ html, core }) => html`<div class="container ${core.nested ? "nested" : "default"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              { value: "container" },
              {
                data: "/core/nested",
                expr: '${0} ? "nested" : "default"',
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с пустыми значениями", () => {
      const mainHtml = extractMainHtmlBlock<{ hidden: boolean; active: boolean }>(
        ({ html, core }) =>
          html`<div class="visible ${core.hidden ? "" : "show"} ${core.active ? "active" : ""}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              { value: "visible" },
              {
                data: "/core/hidden",
                expr: '${0} ? "" : "show"',
              },
              {
                data: "/core/active",
                expr: '${0} ? "active" : ""',
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с атрибутом без кавычек", () => {
      const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
        ({ html, core }) => html`<div class="static-value-${core.active ? "active" : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: 'static-value-${0 ? "active" : "inactive"}',
            },
          },
        },
      ])
    })

    it("class в элементе со сложной строкой с несколькими переменными", () => {
      const mainHtml = extractMainHtmlBlock<any, { user: { id: string; role: string }; theme: string }>(
        ({ html, core }) => html`<div class="user-${core.user.id}-${core.user.role}-${core.theme}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/core/user/id", "/core/user/role", "/core/theme"],
              expr: "user-${0}-${1}-${2}",
            },
          },
        },
      ])
    })

    it("class в элементе со сложной строкой с условными выражениями", () => {
      const mainHtml = extractMainHtmlBlock<
        any,
        {
          user: { id: string; role: string }
          theme: string
          isActive: boolean
        }
      >(
        ({ html, core }) =>
          html`<div
            class="user-${core.user.id}-${core.user.role}-${core.theme}-${core.isActive
              ? "active"
              : "inactive"}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/core/user/id", "/core/user/role", "/core/theme", "/core/isActive"],
              expr: 'user-${0}-${1}-${2}-${3 ? "active" : "inactive"}',
            },
          },
        },
      ])
    })

    it("class в элементе с массивом классов со сложной строкой", () => {
      const mainHtml = extractMainHtmlBlock<any, { user: { id: string; role: string }; theme: string }>(
        ({ html, core }) => html`<div class="base user-${core.user.id}-${core.user.role} theme-${core.theme}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              { value: "base" },
              {
                data: ["/core/user/id", "/core/user/role"],
                expr: "user-${0}-${1}",
              },
              {
                data: "/core/theme",
                expr: "theme-${0}",
              },
            ],
          },
        },
      ])
    })

    it("class в элементе с массивом классов и сложными условными выражениями", () => {
      const mainHtml = extractMainHtmlBlock<
        any,
        {
          user: { id: string; role: string }
          theme: string
          isActive: boolean
          isAdmin: boolean
        }
      >(
        ({ html, core }) =>
          html`<div
            class="base user-${core.user.id} ${core.isActive ? "active" : "inactive"} ${core.isAdmin
              ? "admin"
              : "user"} theme-${core.theme}"></div>`
      )
      const elements = extractHtmlElements(mainHtml)
      const hierarchy = makeHierarchy(mainHtml, elements)
      const attributes = extractAttributes(hierarchy)
      const data = enrichWithData(attributes)

      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          array: {
            class: [
              { value: "base" },
              {
                data: "/core/user/id",
                expr: "user-${0}",
              },
              {
                data: "/core/isActive",
                expr: '${0} ? "active" : "inactive"',
              },
              {
                data: "/core/isAdmin",
                expr: '${0} ? "admin" : "user"',
              },
              {
                data: "/core/theme",
                expr: "theme-${0}",
              },
            ],
          },
        },
      ])
    })
  })
})
