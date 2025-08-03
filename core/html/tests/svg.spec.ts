import { describe, expect, test } from "bun:test"
import { render, svg } from ".."
import type { SVGTemplateResult, TemplateResult } from "../index.t"

describe("svg", () => {
  test("рендерит SVG", () => {
    const container = document.createElement("svg")
    const t = svg`<line y1="1" y2="1"/>`
    render(t, container)
    const line = container.firstElementChild!
    expect(line.tagName).toBe("line")
    expect(line.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  const staticAssertExtends = <T, U extends T>(_?: [T, U]) => {}

  test("`SVGTemplateResult` является подтипом `TemplateResult`", () => {
    staticAssertExtends<TemplateResult, SVGTemplateResult>()
  })

  test("`svg` возвращает `SVGTemplateResult`", () => {
    staticAssertExtends<SVGTemplateResult, ReturnType<typeof svg>>()
  })
})
