import { beforeEach, describe, expect, test } from "bun:test"
import { html, render, noChange, nothing } from "../../html"

describe("текст", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })
  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
  const assertNoRenderedNodes = () => {
    const children = Array.from(container.querySelector("div")!.childNodes)
    expect(children.filter((node) => node.nodeType !== Node.COMMENT_NODE)).toHaveLength(0)
  }

  test("рендерит простое текстовое выражение", () => {
    render(html` test `, container)
    assertContent("test")
  })

  test("рендерит строку", () => {
    render(html` <div>${"foo"}</div> `, container)
    assertContent("<div>foo</div>")
  })

  test("рендерит число", () => {
    render(html` <div>${123}</div> `, container)
    assertContent("<div>123</div>")
  })
  ;[nothing, undefined, null, ""].forEach((value: unknown) => {
    test(`рендерит '${value === "" ? "пустую строку" : value === nothing ? "nothing" : value}' как ничего`, () => {
      const template = (i: any) => html` <div>${i}</div> `
      render(template(value), container)
      assertNoRenderedNodes()
      render(template("foo"), container)
      render(template(value), container)
      assertNoRenderedNodes()
    })
  })

  test("рендерит noChange", () => {
    const template = (i: any) => html` <div>${i}</div> `
    render(template("foo"), container)
    render(template(noChange), container)
    assertContent("<div>foo</div>")
  })

  test("рендерит Symbol", () => {
    render(html` <div>${Symbol("A")}</div> `, container)
    expect(container.querySelector("div")!.textContent!.toLowerCase()).toContain("symbol")
  })

  test("не вызывает функцию, привязанную к тексту", () => {
    const f = () => {
      throw new Error()
    }
    render(html` ${f} `, container)
  })

  test("рендерит вложенные шаблоны", () => {
    const partial = html` <h1>${"foo"}</h1> `
    render(html` ${partial}${"bar"} `, container)
    assertContent("<h1>foo</h1>bar")
  })

  test("рендерит шаблон, вложенный несколько раз", () => {
    const partial = html` <h1>${"foo"}</h1> `
    render(html` ${partial}${"bar"}${partial}${"baz"}qux `, container)
    assertContent("<h1>foo</h1>bar<h1>foo</h1>bazqux")
  })

  test("рендерит значение, которое переключается между шаблоном и undefined", () => {
    const go = (v: unknown) => render(html` ${v} `, container)
    go(undefined)
    assertContent("")
    go(html` <h1>Hello</h1> `)
    assertContent("<h1>Hello</h1>")
  })

  test("рендерит элемент", () => {
    const child = document.createElement("p")
    render(html` <div>${child}</div> `, container)
    assertContent("<div><p></p></div>")
  })

  test("рендерит формы как элементы", () => {
    // Формы являются одновременно Node и итерируемыми, поэтому убеждаемся, что они рендерятся как
    // Node.

    const form = document.createElement("form")
    const inputOne = document.createElement("input")
    inputOne.name = "one"
    const inputTwo = document.createElement("input")
    inputTwo.name = "two"

    form.appendChild(inputOne)
    form.appendChild(inputTwo)

    render(html` ${form} `, container)

    assertContent('<form><input name="one"><input name="two"></form>')
  })
})
