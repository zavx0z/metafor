import {unsafeHTML} from "../../directives/unsafe-html.js"

import {beforeEach, describe, expect, test} from "bun:test"
import {html, noChange, nothing, render} from "../../html.js"

describe("unsafeHTML directive", () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement("div")
  })

  test("renders HTML", () => {
    render(
      html`
        <div>before${unsafeHTML("<span>inner</span>after")}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>before<span>inner</span>after</div>")
  })

  test("rendering `nothing` renders empty string to content", () => {
    render(
      html`
        <div>before${unsafeHTML(nothing)}after</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>beforeafter</div>")
  })

  test("rendering `noChange` does not change the previous content", () => {
    const template = (v: string | typeof noChange) =>
      html`
        <div>before${unsafeHTML(v)}after</div>
      `
    render(template("<p>Hi</p>"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>before<p>Hi</p>after</div>")
    render(template(noChange), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>before<p>Hi</p>after</div>")
  })

  test("rendering `undefined` renders empty string to content", () => {
    render(
      html`
        <div>before${unsafeHTML(undefined)}after</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>beforeafter</div>")
  })

  test("rendering `null` renders empty string to content", () => {
    render(
      html`
        <div>before${unsafeHTML(null)}after</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>beforeafter</div>")
  })

  test("dirty checks primitive values", () => {
    const value = "aaa"
    const t = () => html`
      <div>${unsafeHTML(value)}</div>
    `

    // Initial render
    render(t(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>aaa</div>")

    // Modify instance directly. Since @pkg/html doesn't dirty check against
    // actual DOM, but against previous part values, this modification should
    // persist through the next render if dirty checking works.
    const text = container.querySelector("div")!.childNodes[1] as Text
    text.textContent = "bbb"
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bbb</div>")

    // Re-render with the same value
    render(t(), container)

    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>bbb</div>")

    const text2 = container.querySelector("div")!.childNodes[1] as Text
    expect(text).toBe(text2)
  })

  test("throws on non-string values", () => {
    const value = ["aaa"]
    const t = () => html`
      <div>${unsafeHTML(value as any)}</div>
    `
    expect(() => render(t(), container)).toThrow()
  })

  test("renders after other values", () => {
    const value = "<span></span>"
    const primitive = "aaa"
    const t = (content: any) => html`
      <div>${content}</div>
    `

    // Initial unsafeHTML render
    render(t(unsafeHTML(value)), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><span></span></div>")

    // Re-render with a non-unsafeHTML value
    render(t(primitive), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>aaa</div>")

    // Re-render with unsafeHTML again
    render(t(unsafeHTML(value)), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><span></span></div>")
  })
})
