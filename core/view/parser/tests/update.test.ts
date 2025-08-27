import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("update", () => {
  describe("функция обновления контекста в функции рендера", () => {
    const mainHtml = extractMainHtmlBlock<{ name: string }>(
      ({ html, update }) => html` <button onclick=${() => update({ name: "Jane Doe" })}>OK</button> `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        {
          text: '<button onclick=${() => update({ name: "Jane Doe" })}>',
          index: 1,
          name: "button",
          kind: "open",
        },
        {
          text: "OK",
          index: 55,
          name: "",
          kind: "text",
        },
        {
          text: "</button>",
          index: 57,
          name: "button",
          kind: "close",
        },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "button",
          type: "el",
          text: '<button onclick=${() => update({ name: "Jane Doe" })}>',
          child: [
            {
              type: "text",
              text: "OK",
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              upd: "name",
              expr: `() => update({ name: "Jane Doe" })`,
            },
          },
          child: [
            {
              type: "text",
              value: "OK",
            },
          ],
        },
      ]))
  })

  describe("функция обновления нескольких ключей контекста", () => {
    const mainHtml = extractMainHtmlBlock<{ name: string; age: number; active: boolean }>(
      ({ html, update }) =>
        html` <button onclick=${() => update({ name: "John", age: 25, active: true })}>Update</button> `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        {
          text: '<button onclick=${() => update({ name: "John", age: 25, active: true })}>',
          index: 1,
          name: "button",
          kind: "open",
        },
        { text: "Update", index: 74, name: "", kind: "text" },
        { text: "</button>", index: 80, name: "button", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "button",
          type: "el",
          text: '<button onclick=${() => update({ name: "John", age: 25, active: true })}>',
          child: [
            {
              type: "text",
              text: "Update",
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
          tag: "button",
          type: "el",
          event: {
            onclick: {
              upd: ["name", "age", "active"],
              expr: '() => update({ name: "John", age: 25, active: true })',
            },
          },
          child: [
            {
              type: "text",
              value: "Update",
            },
          ],
        },
      ])
    })
  })

  describe("функция обновления контекста данными из контекста", () => {
    const mainHtml = extractMainHtmlBlock<{ count: number }>(
      ({ html, update, context }) => html` <button onclick=${() => update({ count: context.count + 1 })}>OK</button> `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        {
          text: "<button onclick=${() => update({ count: context.count + 1 })}>",
          index: 1,
          name: "button",
          kind: "open",
        },
        { text: "OK", index: 63, name: "", kind: "text" },
        { text: "</button>", index: 65, name: "button", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "button",
          type: "el",
          text: "<button onclick=${() => update({ count: context.count + 1 })}>",
          child: [
            {
              type: "text",
              text: "OK",
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
          tag: "button",
          type: "el",
          event: {
            onclick: {
              upd: "count",
              data: "/context/count",
              expr: "() => update({ count: ${0} + 1 })",
            },
          },
          child: [
            {
              type: "text",
              value: "OK",
            },
          ],
        },
      ])
    })
  })

  describe("функция обновления контекста данными из core и context", () => {
    const mainHtml = extractMainHtmlBlock<{ count: number; iteration: number }>(
      ({ html, update, core, context }) =>
        html`
          <button onclick=${() => update({ count: core.count + context.count, iteration: context.iteration + 1 })}>
            OK
          </button>
        `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        {
          text: "<button onclick=${() => update({ count: core.count + context.count, iteration: context.iteration + 1 })}>",
          index: 11,
          name: "button",
          kind: "open",
        },
        {
          text: "\n            OK\n          ",
          index: 116,
          name: "",
          kind: "text",
        },
        {
          text: "</button>",
          index: 142,
          name: "button",
          kind: "close",
        },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "button",
          type: "el",
          text: "<button onclick=${() => update({ count: core.count + context.count, iteration: context.iteration + 1 })}>",
          child: [
            {
              type: "text",
              text: "\n            OK\n          ",
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
          tag: "button",
          type: "el",
          event: {
            onclick: {
              upd: ["count", "iteration"],
              data: ["/core/count", "/context/count", "/context/iteration"],
              expr: "() => update({ count: ${0} + ${1}, iteration: ${2} + 1 })",
            },
          },
          child: [
            {
              type: "text",
              value: "OK",
            },
          ],
        },
      ])
    })
  })

  describe("функция обновления контекста данными из core и context внутри массива вложенного в массив", () => {
    const mainHtml = extractMainHtmlBlock<
      { count: number; iteration: number },
      { items: { count: number; iteration: number }[]; count: number; iteration: number }
    >(
      ({ html, update, core }) =>
        html`
          ${core.items.map(
            (item) => html`
              <button onclick=${() => update({ count: core.count + item.count, iteration: item.iteration + 1 })}>
                OK
              </button>
            `
          )}
        `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        {
          text: "<button onclick=${() => update({ count: core.count + item.count, iteration: item.iteration + 1 })}>",
          index: 58,
          name: "button",
          kind: "open",
        },
        {
          text: "\n                OK\n              ",
          index: 157,
          name: "",
          kind: "text",
        },
        {
          text: "</button>",
          index: 191,
          name: "button",
          kind: "close",
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
              tag: "button",
              type: "el",
              text: "<button onclick=${() => update({ count: core.count + item.count, iteration: item.iteration + 1 })}>",
              child: [
                {
                  type: "text",
                  text: "\n                OK\n              ",
                },
              ],
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
              tag: "button",
              type: "el",
              event: {
                onclick: {
                  upd: ["count", "iteration"],
                  data: ["/core/count", "[item]/count", "[item]/iteration"],
                  expr: "() => update({ count: ${0} + ${1}, iteration: ${2} + 1 })",
                },
              },
              child: [
                {
                  type: "text",
                  value: "OK",
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
