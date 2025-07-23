import { describe, expect, test } from "bun:test"
import { mathml, render } from "../html"
import type { MathMLTemplateResult, TemplateResult } from "../html.t"

describe("MathML", () => {
  test("рендерит MathML", () => {
    const container = document.createElement("math")
    const t = mathml`<mi>x</mi>`
    render(t, container)
    const mi = container.firstElementChild!
    expect(mi.tagName).toBe("MI")
    expect(mi.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
  })

  const staticAssertExtends = <T, U extends T>(_?: [T, U]) => {}

  test("`MathMLTemplateResult` является подтипом `TemplateResult`", () => {
    staticAssertExtends<TemplateResult, MathMLTemplateResult>()
  })

  test("`mathml` возвращает `MathMLTemplateResult`", () => {
    staticAssertExtends<MathMLTemplateResult, ReturnType<typeof mathml>>()
  })
})
