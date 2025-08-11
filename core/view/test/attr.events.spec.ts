import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../parser/index.ts"
import type { Schema } from "../parser/index.ts"

describe("стандартные события on*", () => {
  describe("onclick с выражением", () => {
    const result = parseTemplate(`<button onclick="\${() => context.onClick()}">OK</button>`)
    const expected: Schema = [
      {
        tag: "button",
        type: "el",
        attrs: {
          onclick: "${() => context.onClick()}",
        },
        child: [
          {
            type: "text",
            value: "OK",
          },
        ],
      },
    ]
    it("парсинг", () => {
      expect(result, "должен распознать onclick и не сериализовать функцию").toEqual(expected)
    })
    it("рендер", () => {})
  })

  describe("onclick без кавычек со стрелочной функцией", () => {
    const result = parseTemplate(`<button onclick=\${() => context.onClick()}>OK</button>`)
    const expected: Schema = [
      {
        tag: "button",
        type: "el",
        attrs: {
          onclick: "${() => context.onClick()}",
        },
        child: [{ type: "text", value: "OK" }],
      },
    ]
    it("парсинг", () => {
      expect(result, "onclick без кавычек со стрелочной функцией").toEqual(expected)
    })
    it("рендер", () => {})
  })

  describe("onclick без значения (булев)", () => {
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
    it("парсинг", () => {
      expect(result, "должен поддерживать onclick без значения").toEqual(expected)
    })
    it("рендер", () => {})
  })

  describe("несколько событий в самозакрывающемся теге", () => {
    const result = parseTemplate(`<input onclick="\${() => core.onClick()}" oninput="\${(e) => core.onInput(e)}" />`)
    const expected: Schema = [
      {
        tag: "input",
        type: "el",
        attrs: {
          onclick: "${() => core.onClick()}",
          oninput: "${(e) => core.onInput(e)}",
        },
      },
    ]
    it("парсинг", () => {
      expect(result, "должен поддерживать несколько событий on*").toEqual(expected)
    })
    it("рендер", () => {})
  })

  describe("oninput без кавычек со стрелочной функцией (input)", () => {
    const result = parseTemplate(`<input oninput=\${(e) => core.onInput(e)} />`)
    const expected: Schema = [
      {
        tag: "input",
        type: "el",
        attrs: { oninput: "${(e) => core.onInput(e)}" },
      },
    ]
    it("парсинг", () => {
      expect(result, "oninput без кавычек со стрелочной функцией").toEqual(expected)
    })
    it("рендер", () => {})
  })

  describe("событие внутри массива", () => {
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
    it("парсинг", () => {
      expect(result, "должен поддерживать события в элементах массива").toEqual(expected)
    })
    it("рендер", () => {})
  })

  describe("все стандартные on*-события на обычном элементе", () => {
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
      const tpl = `<div ${ev}="\${(e) => context.handler(e)}"></div>`
      const result = parseTemplate(tpl)
      const expected: Schema = [
        { tag: "div", type: "el", attrs: { [ev]: "${(e) => context.handler(e)}" } as Record<string, string> },
      ]
      it(`парсинг ${ev}`, () => {
        expect(result, `должен поддерживать событие ${ev}`).toEqual(expected)
      })
    }
    it("рендер", () => {})
  })

  describe("все стандартные on*-события в самозакрывающемся теге", () => {
    const events = ["onclick", "oninput", "onchange", "onfocus", "onblur"] as const
    for (const ev of events) {
      const tpl = `<input ${ev}="\${() => core.handler()}" />`
      const result = parseTemplate(tpl)
      const expected: Schema = [
        { tag: "input", type: "el", attrs: { [ev]: "${() => core.handler()}" } as Record<string, string> },
      ]
      it(`парсинг ${ev}`, () => {
        expect(result, `должен поддерживать событие ${ev} на input`).toEqual(expected)
      })
    }
    it("рендер", () => {})
  })
})
