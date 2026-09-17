import {keyed} from "../../directives/keyed.js"
import {html, render} from "../../html.js"
import {test, describe, expect, beforeAll} from "bun:test"

describe("keyed directive", () => {
  let container: HTMLDivElement

  beforeAll(() => {
    container = document.createElement("div")
  })

  test("re-renders when the key changes", () => {
    const go = (k: any) =>
      render(
        keyed(
          k,
          html`
            <div .foo=${k}></div>
          `
        ),
        container
      )

    // Initial render
    go(1)
    const div = container.firstElementChild
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect((div as any).foo).toBe(1)

    // Rerendering with same key should reuse the DOM
    go(1)
    const div2 = container.firstElementChild
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect((div2 as any).foo).toBe(1)
    expect(div).toBe(div2)

    // Rerendering with a different key should not reuse the DOM
    go(2)
    const div3 = container.firstElementChild
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect((div3 as any).foo).toBe(2)
    expect(div).not.toBe(div3)
  })
})
