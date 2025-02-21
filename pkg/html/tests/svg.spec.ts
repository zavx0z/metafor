import {describe, expect, test} from "bun:test"
import {render, svg} from "../html"
import type {SVGTemplateResult, TemplateResult} from "../types/html"

describe("svg", () => {
  test("renders SVG", () => {
    const container = document.createElement("svg")
    const t = svg`<line y1="1" y2="1"/>`
    render(t, container)
    const line = container.firstElementChild!
    expect(line.tagName).toBe("line")
    expect(line.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  const staticAssertExtends = <T, U extends T>(_?: [T, U]) => {
  }

  test("`SVGTemplateResult` is a subtype of `TemplateResult`", () => {
    staticAssertExtends<TemplateResult, SVGTemplateResult>()
  })

  test("`svg` returns an `SVGTemplateResult`", () => {
    staticAssertExtends<SVGTemplateResult, ReturnType<typeof svg>>()
  })
})
