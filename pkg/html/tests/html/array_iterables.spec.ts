import {html, render} from "../../html.js"
import {describe, expect, beforeEach, test} from "bun:test"

describe("arrays & iterables", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })
  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)

  test("renders arrays", () => {
    render(
      html`
        <div>${[1, 2, 3]}</div>
      `,
      container
    )
    assertContent("<div>123</div>")
  })

  test("renders arrays of nested templates", () => {
    render(
      html`
        <div>
          ${[1, 2, 3].map(
            i =>
              html`
                ${i}
              `
          )}
        </div>
      `,
      container
    )
    assertContent("<div>123</div>")
  })

  test("renders an array of elements", () => {
    const children = [document.createElement("p"), document.createElement("a"), document.createElement("span")]
    render(
      html`
        <div>${children}</div>
      `,
      container
    )
    assertContent("<div><p></p><a></a><span></span></div>")
  })

  test("updates when called multiple times with arrays", () => {
    const ul = (list: string[]) => {
      const items = list.map(
        item => html`
          <li>${item}</li>
        `
      )
      return html`
        <ul>
          ${items}
        </ul>
      `
    }
    render(ul(["a", "b", "c"]), container)
    assertContent("<ul><li>a</li><li>b</li><li>c</li></ul>")
    render(ul(["x", "y"]), container)
    assertContent("<ul><li>x</li><li>y</li></ul>")
  })

  test("updates arrays", () => {
    let items = [1, 2, 3]
    const t = () => html`
      <div>${items}</div>
    `
    render(t(), container)
    assertContent("<div>123</div>")

    items = [3, 2, 1]
    render(t(), container)
    assertContent("<div>321</div>")
  })

  test("updates arrays that shrink then grow", () => {
    let items: number[]
    const t = () => html`
      <div>${items}</div>
    `

    items = [1, 2, 3]
    render(t(), container)
    assertContent("<div>123</div>")

    items = [4]
    render(t(), container)
    assertContent("<div>4</div>")

    items = [5, 6, 7]
    render(t(), container)
    assertContent("<div>567</div>")
  })

  test("updates an array of elements", () => {
    let children: any = [document.createElement("p"), document.createElement("a"), document.createElement("span")]
    const t = () => html`
      <div>${children}</div>
    `
    render(t(), container)
    assertContent("<div><p></p><a></a><span></span></div>")

    children = null
    render(t(), container)
    assertContent("<div></div>")

    children = document.createTextNode("foo")
    render(t(), container)
    assertContent("<div>foo</div>")
  })
})
