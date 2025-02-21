import {describe, expect, test} from "bun:test"
import {mathml, render} from "../html"
import type {MathMLTemplateResult, TemplateResult} from "../types/html"

describe("MathML", () => {
  test("renders MathML", () => {
    const container = document.createElement("math")
    const t = mathml`<mi>x</mi>`
    render(t, container)
    const mi = container.firstElementChild!
    expect(mi.tagName).toBe("MI")
    expect(mi.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
  })

  const staticAssertExtends = <T, U extends T>(_?: [T, U]) => {}

  test("`MathMLTemplateResult` is a subtype of `TemplateResult`", () => {
    staticAssertExtends<TemplateResult, MathMLTemplateResult>()
  })

  test("`mathml` returns a `MathMLTemplateResult`", () => {
    staticAssertExtends<MathMLTemplateResult, ReturnType<typeof mathml>>()
  })
})
