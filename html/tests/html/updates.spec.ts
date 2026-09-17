import {beforeEach, describe, expect, test} from "bun:test"
import {html, render} from "../../html"

describe("updates", () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement("div")
  })

  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)

  test("dirty checks simple values", () => {
    const foo = "aaa"

    const t = () => html`
      <div>${foo}</div>
    `

    render(t(), container)
    assertContent("<div>aaa</div>")
    const text = container.querySelector("div")!
    expect(text.textContent).toBe("aaa")

    // Set textContent manually (without disturbing the part marker node).
    // Since @pkg/html doesn't dirty check against actual DOM, but again
    // previous part values, this modification should persist through the
    // next render with the same value.
    text.lastChild!.textContent = "bbb"
    expect(text.textContent).toBe("bbb")
    assertContent("<div>bbb</div>")

    // Re-render with the same content, should be a no-op
    render(t(), container)
    assertContent("<div>bbb</div>")
    const text2 = container.querySelector("div")!

    // The next node should be the same too
    expect(text).toBe(text2)
  })

  test("dirty checks node values", async () => {
    const node = document.createElement("div")
    const t = () =>
      html`
        ${node}
      `

    const observer = new MutationObserver(() => {
    })
    observer.observe(container, {childList: true, subtree: true})

    assertContent("")
    render(t(), container)
    assertContent("<div></div>")

    const elementNodes: Node[] = []
    let mutationRecords: MutationRecord[] = observer.takeRecords()
    for (const record of mutationRecords) {
      elementNodes.push(...Array.from(record.addedNodes).filter(n => n.nodeType === Node.ELEMENT_NODE))
    }
    expect(elementNodes.length).toBe(1)

    mutationRecords = []
    render(t(), container)
    assertContent("<div></div>")
    mutationRecords = observer.takeRecords()
    expect(mutationRecords.length).toBe(0)
  })

  test("renders to and updates a container", () => {
    let foo = "aaa"

    const t = () => html`
      <div>${foo}</div>
    `

    render(t(), container)
    assertContent("<div>aaa</div>")
    const div = container.querySelector("div")!
    expect(div.tagName).toBe("DIV")

    foo = "bbb"
    render(t(), container)
    assertContent("<div>bbb</div>")
    const div2 = container.querySelector("div")!
    // check that only the part changed
    expect(div).toBe(div2)
  })

  test("renders to and updates sibling parts", () => {
    let foo = "foo"
    const bar = "bar"

    const t = () => html`
      <div>${foo}${bar}</div>
    `

    render(t(), container)
    assertContent("<div>foobar</div>")

    foo = "bbb"
    render(t(), container)
    assertContent("<div>bbbbar</div>")
  })

  test("renders and updates attributes", () => {
    let foo = "foo"
    const bar = "bar"

    const t = () => html`
      <div a="${foo}:${bar}"></div>
    `

    render(t(), container)
    assertContent('<div a="foo:bar"></div>')

    foo = "bbb"
    render(t(), container)
    assertContent('<div a="bbb:bar"></div>')
  })

  test("updates nested templates", () => {
    let foo = "foo"
    const bar = "bar"
    const baz = "baz"

    const t = (x: boolean) => {
      let partial
      if (x) {
        partial = html`
          <h1>${foo}</h1>
        `
      } else {
        partial = html`
          <h2>${bar}</h2>
        `
      }

      return html`
        ${partial}${baz}
      `
    }

    render(t(true), container)
    assertContent("<h1>foo</h1>baz")

    foo = "bbb"
    render(t(true), container)
    assertContent("<h1>bbb</h1>baz")

    render(t(false), container)
    assertContent("<h2>bar</h2>baz")
  })

  test("updates an element", () => {
    let child: any = document.createElement("p")
    const t = () => html`
      <div>
        ${child}
        <div></div>
      </div>
    `
    render(t(), container)
    assertContent("<div><p></p><div></div></div>")

    child = undefined
    render(t(), container)
    assertContent("<div><div></div></div>")

    child = document.createTextNode("foo")
    render(t(), container)
    assertContent("<div>foo<div></div></div>")
  })

  test("overwrites an existing TemplateInstance if one exists and does " + "not have a matching Template", () => {
    render(
      html`
        <div>foo</div>
      `,
      container
    )

    expect(container.children.length).toBe(1)
    const fooDiv = container.children[0]
    expect(fooDiv.textContent).toBe("foo")

    render(
      html`
        <div>bar</div>
      `,
      container
    )

    expect(container.children.length).toBe(1)
    const barDiv = container.children[0]
    expect(barDiv.textContent).toBe("bar")

    expect(fooDiv).not.toBe(barDiv)
  })
})
