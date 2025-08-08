import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { html, render } from "../.."
import type { SanitizerFactory } from "../../index.t"

describe("расширенные хуки безопасности", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
    // @ts-ignore
    render.setSanitizer(testSanitizerFactory)
  })

  afterEach(() => {
    // @ts-ignore
    render._testOnlyClearSanitizerFactoryDoNotCallOrElse()
    sanitizerCalls.length = 0
  })

  class FakeSanitizedWrapper {
    sanitizeTo: string

    constructor(sanitizeTo: string) {
      this.sanitizeTo = sanitizeTo
    }

    toString() {
      return `FakeSanitizedWrapper(${this.sanitizeTo})`
    }
  }

  const sanitizerCalls: Array<{
    name: string
    type: "property" | "attribute" | "text"
    nodeName: string
    values: readonly unknown[]
  }> = []
  const testSanitizer = (value: unknown) => {
    if (value instanceof FakeSanitizedWrapper) {
      return value.sanitizeTo
    }
    return "safeString"
  }
  const testSanitizerFactory: SanitizerFactory = (node, name, type) => {
    const values: unknown[] = []
    sanitizerCalls.push({ values, name, type, nodeName: node.nodeName })
    return (value) => {
      values.push(value)
      return testSanitizer(value)
    }
  }

  test("санитизирует текстовое содержимое, когда текст находится отдельно", () => {
    const getTemplate = (value: unknown) => html` <div>${value}</div> `
    render(getTemplate("foo"), container)
    expect(container.innerHTML, "innerHTML должен содержать safeString").toMatchStringHTMLStripComments(
      "<div>safeString</div>"
    )

    const safeFoo = new FakeSanitizedWrapper("foo")
    render(getTemplate(safeFoo), container)
    expect(container.innerHTML, "innerHTML должен содержать foo").toMatchStringHTMLStripComments("<div>foo</div>")

    expect(sanitizerCalls, "sanitizerCalls должен содержать вызовы для foo и safeFoo").toEqual([
      {
        values: ["foo", safeFoo],
        name: "data",
        type: "property",
        nodeName: "#text",
      },
    ])
  })

  test("санитизирует текстовое содержимое, когда текст интерполируется", () => {
    const getTemplate = (value: unknown) => html` <div>hello ${value} world</div> `
    render(getTemplate("big"), container)
    expect(container.innerHTML, "innerHTML должен содержать safeString").toMatchStringHTMLStripComments(
      "<div>hello safeString world</div>"
    )

    const safeBig = new FakeSanitizedWrapper("big")

    render(getTemplate(safeBig), container)
    expect(container.innerHTML, "innerHTML должен содержать big").toMatchStringHTMLStripComments(
      "<div>hello big world</div>"
    )

    expect(sanitizerCalls, "sanitizerCalls должен содержать вызовы для big и safeBig").toEqual([
      {
        values: ["big", safeBig],
        name: "data",
        type: "property",
        nodeName: "#text",
      },
    ])
  })

  test("санитизирует полные значения атрибутов", () => {
    const getTemplate = (value: unknown) => html` <div attrib=${value}></div> `
    render(getTemplate("bad"), container)
    expect(container.innerHTML, "innerHTML должен содержать safeString").toMatchStringHTMLStripComments(
      '<div attrib="safeString"></div>'
    )

    const safe = new FakeSanitizedWrapper("good")
    render(getTemplate(safe), container)
    expect(container.innerHTML, "innerHTML должен содержать good").toMatchStringHTMLStripComments(
      '<div attrib="good"></div>'
    )

    expect(sanitizerCalls, "sanitizerCalls должен содержать вызовы для bad и good").toEqual([
      {
        values: ["bad", safe],
        name: "attrib",
        type: "attribute",
        nodeName: "DIV",
      },
    ])
  })

  test("санитизирует конкатенированные атрибуты после конкатенации", () => {
    render(html` <div attrib="hello ${"big"} world"></div> `, container)
    expect(container.innerHTML, "innerHTML должен содержать safeString").toMatchStringHTMLStripComments(
      '<div attrib="safeString"></div>'
    )

    expect(sanitizerCalls, "sanitizerCalls должен содержать вызов для hello big world").toEqual([
      {
        values: ["hello big world"],
        name: "attrib",
        type: "attribute",
        nodeName: "DIV",
      },
    ])
  })

  test("санитизирует свойства", () => {
    const getTemplate = (value: unknown) => html` <div .foo=${value}></div> `
    render(getTemplate("bad"), container)
    expect(container.innerHTML, "innerHTML должен быть пустым div").toMatchStringHTMLStripComments("<div></div>")
    expect((container.querySelector("div")! as any).foo, "foo должен быть safeString").toBe("safeString")

    const safe = new FakeSanitizedWrapper("good")
    render(getTemplate(safe), container)
    expect(container.innerHTML, "innerHTML должен быть пустым div").toMatchStringHTMLStripComments("<div></div>")
    expect((container.querySelector("div")! as any).foo, "foo должен быть good").toBe("good")

    expect(sanitizerCalls, "sanitizerCalls должен содержать вызовы для bad и good").toEqual([
      { values: ["bad", safe], name: "foo", type: "property", nodeName: "DIV" },
    ])
  })
})
