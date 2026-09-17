import {beforeEach, describe, expect, test} from "bun:test"
import {html, noChange} from "../../html.js"
import { nothing} from "../../html.js"
import {render} from "../../html.js"

describe("text", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })
  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
  const assertNoRenderedNodes = () => {
    const children = Array.from(container.querySelector("div")!.childNodes)
    expect(children.filter(node => node.nodeType !== Node.COMMENT_NODE)).toHaveLength(0)
  }

  test("renders plain text expression", () => {
    render(
      html`
        test
      `,
      container
    )
    assertContent("test")
  })

  test("renders a string", () => {
    render(
      html`
        <div>${"foo"}</div>
      `,
      container
    )
    assertContent("<div>foo</div>")
  })

  test("renders a number", () => {
    render(
      html`
        <div>${123}</div>
      `,
      container
    )
    assertContent("<div>123</div>")
  })
  ;[nothing, undefined, null, ""].forEach((value: unknown) => {
    test(`renders '${value === "" ? "empty string" : value === nothing ? "nothing" : value}' as nothing`, () => {
      const template = (i: any) => html`
        <div>${i}</div>
      `
      render(template(value), container)
      assertNoRenderedNodes()
      render(template("foo"), container)
      render(template(value), container)
      assertNoRenderedNodes()
    })
  })

  test("renders noChange", () => {
    const template = (i: any) => html`
      <div>${i}</div>
    `
    render(template("foo"), container)
    render(template(noChange), container)
    assertContent("<div>foo</div>")
  })

  test("renders a Symbol", () => {
    render(
      html`
        <div>${Symbol("A")}</div>
      `,
      container
    )
    expect(container.querySelector("div")!.textContent!.toLowerCase()).toContain("symbol")
  })

  test("does not call a function bound to text", () => {
    const f = () => {
      throw new Error()
    }
    render(
      html`
        ${f}
      `,
      container
    )
  })

  test("renders nested templates", () => {
    const partial = html`
      <h1>${"foo"}</h1>
    `
    render(
      html`
        ${partial}${"bar"}
      `,
      container
    )
    assertContent("<h1>foo</h1>bar")
  })

  test("renders a template nested multiple times", () => {
    const partial = html`
      <h1>${"foo"}</h1>
    `
    render(
      html`
        ${partial}${"bar"}${partial}${"baz"}qux
      `,
      container
    )
    assertContent("<h1>foo</h1>bar<h1>foo</h1>bazqux")
  })

  test("renders value that switches between template and undefined", () => {
    const go = (v: unknown) =>
      render(
        html`
          ${v}
        `,
        container
      )
    go(undefined)
    assertContent("")
    go(
      html`
        <h1>Hello</h1>
      `
    )
    assertContent("<h1>Hello</h1>")
  })

  test("renders an element", () => {
    const child = document.createElement("p")
    render(
      html`
        <div>${child}</div>
      `,
      container
    )
    assertContent("<div><p></p></div>")
  })

  test("renders forms as elements", () => {
    // Forms are both a Node and iterable, so make sure they are rendered as
    // a Node.

    const form = document.createElement("form")
    const inputOne = document.createElement("input")
    inputOne.name = "one"
    const inputTwo = document.createElement("input")
    inputTwo.name = "two"

    form.appendChild(inputOne)
    form.appendChild(inputTwo)

    render(
      html`
        ${form}
      `,
      container
    )

    assertContent('<form><input name="one"><input name="two"></form>')
  })
})
