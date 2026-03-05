import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("update", () => {
  describe("функция обновления контекста в функции рендера", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ name: string }>(
        ({ html, update }) => html` <button onclick=${() => update({ name: "Jane Doe" })}>OK</button> `
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
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ name: string; age: number; active: boolean }>(
        ({ html, update }) =>
          html` <button onclick=${() => update({ name: "John", age: 25, active: true })}>Update</button> `
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
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ count: number }>(
        ({ html, update, fields }) => html` <button onclick=${() => update({ count: fields.count + 1 })}>OK</button> `
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
              data: "/fields/count",
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

  describe("функция обновления fields данными из mass и fields", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ count: number; iteration: number }>(
        ({ html, update, mass, fields }) =>
          html`
            <button onclick=${() => update({ count: mass.count + fields.count, iteration: fields.iteration + 1 })}>
              OK
            </button>
          `
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
              data: ["/mass/count", "/fields/count", "/fields/iteration"],
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

  describe("функция обновления fields данными из mass и fields внутри массива вложенного в массив", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<
        { count: number; iteration: number },
        { items: { count: number; iteration: number }[]; count: number; iteration: number }
      >(
        ({ html, update, mass }) =>
          html`
            ${mass.items.map(
              (item) => html`
                <button onclick=${() => update({ count: mass.count + item.count, iteration: item.iteration + 1 })}>
                  OK
                </button>
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
