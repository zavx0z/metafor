import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("update", () => {
  describe("функция обновления контекста в функции рендера", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ name: { type: "string"; required: true; default: "" } }>(
        ({ html, update }) => html` <button onclick=${() => update({ name: "Jane Doe" })}>OK</button> `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
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
      ])
    })
  })

  describe("функция обновления нескольких ключей контекста", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{
        name: { type: "string"; required: true; default: "" }
        age: { type: "number"; required: true; default: 0 }
        active: { type: "boolean"; required: true; default: false }
      }>(
        ({ html, update }) => html`
          <button onclick=${() => update({ name: "John", age: 25, active: true })}>Update</button>
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
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
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ count: { type: "number"; required: true; default: 0 } }>(
        ({ html, update, value }) => html` <button onclick=${() => update({ count: value.count + 1 })}>OK</button> `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              upd: "count",
              data: "/value/count",
              expr: "() => update({ count: _[0] + 1 })",
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

  describe("функция обновления value данными из mass и value", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{
        count: { type: "number"; required: true; default: 0 }
        iteration: { type: "number"; required: true; default: 0 }
      }>(
        ({ html, update, mass, value }) => html`
          <button onclick=${() => update({ count: mass.count + value.count, iteration: value.iteration + 1 })}>
            OK
          </button>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "button",
          type: "el",
          event: {
            onclick: {
              upd: ["count", "iteration"],
              data: ["/mass/count", "/value/count", "/value/iteration"],
              expr: "() => update({ count: _[0] + _[1], iteration: _[2] + 1 })",
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

  describe("функция обновления value данными из mass и value внутри массива вложенного в массив", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        {
          count: { type: "number"; required: true; default: 0 }
          iteration: { type: "number"; required: true; default: 0 }
        },
        { items: { count: number; iteration: number }[]; count: number; iteration: number }
      >(
        ({ html, update, mass }) => html`
          ${mass.items.map(
            (item) => html`
              <button onclick=${() => update({ count: mass.count + item.count, iteration: item.iteration + 1 })}>
                OK
              </button>
            `,
          )}
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          type: "map",
          data: "/mass/items",
          child: [
            {
              tag: "button",
              type: "el",
              event: {
                onclick: {
                  upd: ["count", "iteration"],
                  data: ["/mass/count", "[item]/count", "[item]/iteration"],
                  expr: "() => update({ count: _[0] + _[1], iteration: _[2] + 1 })",
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
