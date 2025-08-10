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
          onclick: "${context.onClick}",
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
        child: [{ type: "text", value: "OK" }],
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
          onclick: "${core.onClick}",
          oninput: "${core.onInput}",
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

  it("все стандартные on*-события на обычном элементе", () => {
    const events = [
      "onclick",
      "ondblclick",
      "oncontextmenu",
      "onmousedown",
      "onmouseup",
      "onmousemove",
      "onmouseenter",
      "onmouseleave",
      "onmouseover",
      "onmouseout",
      "onwheel",
      "onkeydown",
      "onkeypress",
      "onkeyup",
      "oninput",
      "onchange",
      "onsubmit",
      "onreset",
      "onfocus",
      "onblur",
      "oninvalid",
      "onload",
      "onerror",
      "onabort",
      "onanimationstart",
      "onanimationend",
      "onanimationiteration",
      "ontransitionstart",
      "ontransitionend",
      "ontransitionrun",
      "oncopy",
      "oncut",
      "onpaste",
      "onpointerdown",
      "onpointerup",
      "onpointermove",
      "onpointerenter",
      "onpointerleave",
      "onpointerover",
      "onpointerout",
      // мобильные могут отсутствовать в некоторых окружениях, но как атрибуты парсер должен принять
      "ontouchstart",
      "ontouchend",
      "ontouchmove",
      "ontouchcancel",
    ] as const

    for (const ev of events) {
      const tpl = `<div ${ev}="\${context.handler}"></div>`
      const result = parseTemplate(tpl)
      const expected: Schema = [
        { tag: "div", type: "el", attrs: { [ev]: "${context.handler}" } as Record<string, string> },
      ]
      expect(result, `должен поддерживать событие ${ev}`).toEqual(expected)
    }
  })

  it("все стандартные on*-события в самозакрывающемся теге", () => {
    const events = ["onclick", "oninput", "onchange", "onfocus", "onblur"] as const
    for (const ev of events) {
      const tpl = `<input ${ev}="\${core.handler}" />`
      const result = parseTemplate(tpl)
      const expected: Schema = [
        { tag: "input", type: "el", attrs: { [ev]: "${core.handler}" } as Record<string, string> },
      ]
      expect(result, `должен поддерживать событие ${ev} на input`).toEqual(expected)
    }
  })
})
