import {templateContent} from "../../directives/template-content.js"
import {html, render} from "../../html.js"
import {describe, test, beforeAll, expect} from "bun:test"

describe("templateContent", () => {
  let container: HTMLElement
  const template = document.createElement("template")
  template.innerHTML = "<div>aaa</div>"

  beforeAll(() => {
    container = document.createElement("div")
  })

  test("renders a template", () => {
    render(
      html`
        <div>${templateContent(template)}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><div>aaa</div></div>")
  })

  test("clones a template only once", () => {
    const go = () =>
      render(
        html`
          <div>${templateContent(template)}</div>
        `,
        container
      )
    go()
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><div>aaa</div></div>")
    const templateDiv = container.querySelector("div > div") as HTMLDivElement

    go()
    const templateDiv2 = container.querySelector("div > div") as HTMLDivElement
    expect(templateDiv).toBe(templateDiv2)
  })

  test("renders a new template over a previous one", () => {
    const go = (t: HTMLTemplateElement) =>
      render(
        html`
          <div>${templateContent(t)}</div>
        `,
        container
      )
    go(template)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><div>aaa</div></div>")

    const newTemplate = document.createElement("template")
    newTemplate.innerHTML = "<span>bbb</span>"
    go(newTemplate)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><span>bbb</span></div>")
  })

  test("re-renders a template over a non-templateContent value", () => {
    const go = (v: unknown) =>
      render(
        html`
          <div>${v}</div>
        `,
        container
      )
    go(templateContent(template))
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><div>aaa</div></div>")

    go("ccc")
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>ccc</div>")

    go(templateContent(template))
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div><div>aaa</div></div>")
  })
})
