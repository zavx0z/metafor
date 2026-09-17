import {unsafeMathML} from "../../directives/unsafe-mathml.js"
import {render, html, nothing, noChange} from "../../html.js"
import {describe, test, beforeAll, expect} from "bun:test"

describe("unsafeMathML", () => {
  let container: HTMLElement

  beforeAll(() => {
    container = document.createElement("div")
  })

  test("renders MathML", () => {
    render(
      // prettier-ignore
      html`<math>${unsafeMathML('<mi>x</mi>')}</math>`,
      container
    )
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<math><mi>x</mi></math>',
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
      '<math xmlns="http://www.w3.org/1999/xhtml"><mi>x</mi></math>',
    ])
    const miElement = container.querySelector('mi')!;
    expect(miElement.namespaceURI).toBeOneOf(["http://www.w3.org/1998/Math/MathML", "http://www.w3.org/1999/xhtml"])
    expect(miElement.textContent).toBe("x")
  })

  test("rendering `nothing` renders empty string to content", () => {
    render(
      html`
        <math>before${unsafeMathML(nothing)}after</math>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<math>beforeafter</math>")
  })

  test("rendering `noChange` does not change the previous content", () => {
    const template = (v: string | typeof noChange) =>
      html`
        <math>before${unsafeMathML(v)}after</math>
      `
    render(template("<mi>Hi</mi>"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<math>before<mi>Hi</mi>after</math>")
    render(template(noChange), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<math>before<mi>Hi</mi>after</math>")
  })

  test("rendering `undefined` renders empty string to content", () => {
    render(
      html`
        <math>before${unsafeMathML(undefined)}after</math>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<math>beforeafter</math>")
  })

  test("rendering `null` renders empty string to content", () => {
    render(
      html`
        <math>before${unsafeMathML(null)}after</math>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<math>beforeafter</math>")
  })

  test("dirty checks primitive values", () => {
    const value = "aaa"
    const t = () =>
      html`
        <math>${unsafeMathML(value)}</math>
      `

    // Initial render
    render(t(), container)
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      "<math>aaa</math>",
      '<math xmlns="http://www.w3.org/1998/Math/MathML">aaa</math>'
    ])

    // Modify instance directly. Since @pkg/html doesn't dirty check against
    // actual DOM, but against previous part values, this modification should
    // persist through the next render if dirty checking works.
    const text = container.querySelector("math")!.childNodes[1] as Text
    text.textContent = "bbb"
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      "<math>bbb</math>",
      '<math xmlns="http://www.w3.org/1998/Math/MathML">bbb</math>'
    ])

    // Re-render with the same value
    render(t(), container)
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      "<math>bbb</math>",
      '<math xmlns="http://www.w3.org/1998/Math/MathML">bbb</math>'
    ])
    const text2 = container.querySelector("math")!.childNodes[1] as Text
    expect(text).toBe(text2)
  })

  test("throws on non-string values", () => {
    const value = ["aaa"]
    const t = () =>
      html`
        <div>${unsafeMathML(value as any)}</div>
      `
    expect(() => render(t(), container)).toThrow()
  })

  test("renders after other values", () => {
    const value = "<mi>x</mi>"
    const primitive = "aaa"
    const t = (content: any) =>
      html`
        <math>${content}</math>
      `

    // Initial unsafeMath render
    render(t(unsafeMathML(value)), container)
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      "<math><mi>x</mi></math>",
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'
    ])

    // Re-render with a non-unsafeMath value
    render(t(primitive), container)
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      "<math>aaa</math>",
      '<math xmlns="http://www.w3.org/1998/Math/MathML">aaa</math>'
    ])

    // Re-render with unsafeMath again
    render(t(unsafeMathML(value)), container)
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      "<math><mi>x</mi></math>",
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>'
    ])
  })
})
