import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - стандартные события on*", () => {
  it("onclick с выражением", () => {
    const result = parseTemplate(`<button onclick="\${context.onClick}">OK</button>`)
    const expected: Schema = [
      {
        tag: "button",
        type: "el",
        attrs: {
          onclick: "",
        },
        child: [
          {
            type: "text",
            value: "OK",
          },
        ],
      },
    ]
    expect(result, "должен распознать onclick и не сериализовать функцию").toEqual(expected)
  })

  it("onclick без значения (булев)", () => {
    const result = parseTemplate(`<button onclick>OK</button>`)
    const expected: Schema = [
      {
        tag: "button",
        type: "el",
        attrs: {
          onclick: "",
        },
        child: [
          { type: "text", value: "OK" },
        ],
      },
    ]
    expect(result, "должен поддерживать onclick без значения").toEqual(expected)
  })

  it("несколько событий в самозакрывающемся теге", () => {
    const result = parseTemplate(`<input onclick="\${core.onClick}" oninput="\${core.onInput}" />`)
    const expected: Schema = [
      {
        tag: "input",
        type: "el",
        attrs: {
          onclick: "",
          oninput: "",
        },
      },
    ]
    expect(result, "должен поддерживать несколько событий on*").toEqual(expected)
  })

  it("событие внутри массива", () => {
    const result = parseTemplate(`
      <ul>
        \${context.items.map((it) => html\`<li onclick=\"\\${it}\">item</li>\`)}
      </ul>
    `)
    const expected: Schema = [
      {
        tag: "ul",
        type: "el",
        child: [
          {
            tag: "li",
            type: "el",
            attrs: { onclick: "" },
            child: [{ type: "text", value: "item" }],
            item: { src: "context", key: "items" },
          },
        ],
      },
    ]
    expect(result, "должен поддерживать события в элементах массива").toEqual(expected)
  })
})


