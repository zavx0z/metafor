import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {html, render} from "../../html"

describe("enhanced security hooks", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
    render.setSanitizer(testSanitizerFactory)
  })

  afterEach(() => {
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
    sanitizerCalls.push({values, name, type, nodeName: node.nodeName})
    return value => {
      values.push(value)
      return testSanitizer(value)
    }
  }

  test("sanitizes text content when the text is alone", () => {
    const getTemplate = (value: unknown) => html`
      <div>${value}</div>
    `
    render(getTemplate("foo"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>safeString</div>")

    const safeFoo = new FakeSanitizedWrapper("foo")
    render(getTemplate(safeFoo), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>foo</div>")

    expect(sanitizerCalls).toEqual([
      {
        values: ["foo", safeFoo],
        name: "data",
        type: "property",
        nodeName: "#text"
      }
    ])
  })

  test("sanitizes text content when the text is interpolated", () => {
    const getTemplate = (value: unknown) =>
      html`
        <div>hello ${value} world</div>
      `
    render(getTemplate("big"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>hello safeString world</div>")

    const safeBig = new FakeSanitizedWrapper("big")

    render(getTemplate(safeBig), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>hello big world</div>")

    expect(sanitizerCalls).toEqual([
      {
        values: ["big", safeBig],
        name: "data",
        type: "property",
        nodeName: "#text"
      }
    ])
  })

  test("sanitizes full attribute values", () => {
    const getTemplate = (value: unknown) => html`
      <div attrib=${value}></div>
    `
    render(getTemplate("bad"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div attrib="safeString"></div>')

    const safe = new FakeSanitizedWrapper("good")
    render(getTemplate(safe), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div attrib="good"></div>')

    expect(sanitizerCalls).toEqual([
      {
        values: ["bad", safe],
        name: "attrib",
        type: "attribute",
        nodeName: "DIV"
      }
    ])
  })

  test("sanitizes concatenated attributes after concatenation", () => {
    render(
      html`
        <div attrib="hello ${"big"} world"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div attrib="safeString"></div>')

    expect(sanitizerCalls).toEqual([
      {
        values: ["hello big world"],
        name: "attrib",
        type: "attribute",
        nodeName: "DIV"
      }
    ])
  })

  test("sanitizes properties", () => {
    const getTemplate = (value: unknown) => html`
      <div .foo=${value}></div>
    `
    render(getTemplate("bad"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div></div>")
    expect((container.querySelector("div")! as any).foo).toBe("safeString")

    const safe = new FakeSanitizedWrapper("good")
    render(getTemplate(safe), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div></div>")
    expect((container.querySelector("div")! as any).foo).toBe("good")

    expect(sanitizerCalls).toEqual([{values: ["bad", safe], name: "foo", type: "property", nodeName: "DIV"}])
  })
})
