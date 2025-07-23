import {beforeEach, describe, expect, test} from "bun:test"
import {html, noChange, nothing, render} from "../../html"

describe("boolean attributes", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)

  test("adds attributes for true values", () => {
    render(
      html`
        <div ?foo=${true}></div>
      `,
      container
    )
    assertContent('<div foo=""></div>')
  })

  test("removes attributes for false values", () => {
    render(
      html`
        <div ?foo=${false}></div>
      `,
      container
    )
    assertContent("<div></div>")
  })

  test("removes attributes for nothing values", () => {
    const go = (v: any) =>
      render(
        html`
          <div ?foo=${v}></div>
        `,
        container
      )

    go(nothing)
    assertContent("<div></div>")

    go(true)
    assertContent('<div foo=""></div>')

    go(nothing)
    assertContent("<div></div>")
  })

  test("noChange works", () => {
    const go = (v: any) =>
      render(
        html`
          <div ?foo=${v}></div>
        `,
        container
      )
    go(true)
    assertContent('<div foo=""></div>')
    const observer = new MutationObserver(() => {})
    observer.observe(container, {attributes: true, subtree: true})
    go(noChange)
    assertContent('<div foo=""></div>')
    expect(observer.takeRecords()).toEqual([])
  })

  test("binding undefined removes the attribute", () => {
    const go = (v: unknown) =>
      render(
        html`
          <div ?foo=${v}></div>
        `,
        container
      )
    go(undefined)
    assertContent("<div></div>")
    // it doesn't toggle the attribute
    go(undefined)
    assertContent("<div></div>")
    // it does remove it
    go(true)
    assertContent('<div foo=""></div>')
    go(undefined)
    assertContent("<div></div>")
  })
})
