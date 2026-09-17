import type {CompiledTemplate, CompiledTemplateResult, RenderOptions, TemplateResult} from "../../types/html"
import {beforeEach, describe, expect, test} from "bun:test"
import {AttributePart, render} from "../../html.js"
import {createRef, ref} from "../../directives/ref"

describe("скомпилированные шаблоны", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  const assertRender = (r: TemplateResult | CompiledTemplateResult, expected: string, options?: RenderOptions) => {
    const part = render(r, container, options)
    expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
    return part
  }

  const branding_tag = (s: TemplateStringsArray) => s

  test("только текст", () => {
    // Скомпилированный шаблон для html`${'A'}`
    const _$atom_template_1: CompiledTemplate = {
      h: branding_tag`<!---->`,
      parts: [{type: 2, index: 0}]
    }
    assertRender(
      {
        ["_$atomType$"]: _$atom_template_1,
        values: ["A"]
      },
      "A"
    )
  })

  test("текстовое выражение", () => {
    // Скомпилированный шаблон для html`<div>${'A'}</div>`
    const _$atom_template_1: CompiledTemplate = {
      h: branding_tag`<div><!----></div>`,
      parts: [{type: 2, index: 1}]
    }
    const result = {
      ["_$atomType$"]: _$atom_template_1,
      values: ["A"]
    }
    assertRender(result, "<div>A</div>")
  })

  test("выражение атрибута", () => {
    // Скомпилированный шаблон для html`<div foo=${'A'}></div>`
    const _$atom_template_1: CompiledTemplate = {
      h: branding_tag`<div></div>`,
      parts: [
        {
          type: 1,
          index: 0,
          name: "foo",
          strings: ["", ""],
          ctor: AttributePart
        }
      ]
    }
    const result = {
      ["_$atomType$"]: _$atom_template_1,
      values: ["A"]
    }
    assertRender(result, '<div foo="A"></div>')
  })

  test.skip("выражение элемента", () => {
    const r = createRef()
    // Скомпилированный шаблон для html`<div ${ref(r)}></div>`
    const _$atom_template_1: CompiledTemplate = {
      h: branding_tag`<div></div>`,
      parts: [{type: 6, index: 0}]
    }
    const result = {
      ["_$atomType$"]: _$atom_template_1,
      values: [ref(r)]
    }
    assertRender(result, "<div></div>")
    const div = container.firstElementChild
    expect(div).toBeDefined()
    expect(r.value).toBe(div)
  })

  test(`выбросить ошибку если не брендировано`, () => {
    const _$atom_template_1: CompiledTemplate = {
      h: ["<div><!----></div>"] as unknown as TemplateStringsArray,
      parts: [{type: 2, index: 1}]
    }
    const result = {
      ["_$atomType$"]: _$atom_template_1,
      values: ["A"]
    }
    expect(() => render(result, container)).toThrow()
  })
})
