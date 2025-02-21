import {describe, test, beforeAll, expect} from "bun:test"
import {html, render, nothing} from "../../html.js"
import {cache} from "../../directives/cache.js"

import {directive} from "../../directive.js"

// For compiled template tests
import {_$LH} from "../../private-ssr-support.js"
import {AsyncDirective} from "../../async-directive.js"
import type {CompiledTemplate} from "../../types/html.js"

const branding_tag = (s: TemplateStringsArray) => s

describe("cache directive", () => {
  let container: HTMLDivElement

  beforeAll(() => {
    container = document.createElement("div")
  })

  test("caches templates", () => {
    const renderCached = (condition: any, v: string) => render( html`${cache( condition ? html`<div v=${v}></div>` : html`<span v=${v}></span>` )}`, container ) // prettier-ignore

    renderCached(true, "A")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="A"></div>')
    const element1 = container.firstElementChild

    renderCached(false, "B")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<span v="B"></span>')
    const element2 = container.firstElementChild

    expect(element1).not.toBe(element2)

    renderCached(true, "C")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="C"></div>')
    expect(container.firstElementChild).toBe(element1)

    renderCached(false, "D")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<span v="D"></span>')
    expect(container.firstElementChild).toBe(element2)
  })

  test("caches compiled templates", () => {
    const _$lit_template_1: CompiledTemplate = {
      h: branding_tag`<div></div>`,
      parts: [
        {
          type: 1,
          index: 0,
          name: "v",
          strings: ["", ""],
          ctor: _$LH.AttributePart
        }
      ]
    }
    const _$lit_template_2: CompiledTemplate = {
      h: branding_tag`<span></span>`,
      parts: [
        {
          type: 1,
          index: 0,
          name: "v",
          strings: ["", ""],
          ctor: _$LH.AttributePart
        }
      ]
    }
    const renderCached = (condition: any, v: string) =>
      render(
        html` ${cache( condition ? { _$atomType$: _$lit_template_1, values: [v] } : { _$atomType$: _$lit_template_2, values: [v] } )} `,
        container
      ) // prettier-ignore

    renderCached(true, "A")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="A"></div>')
    const element1 = container.firstElementChild

    renderCached(false, "B")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<span v="B"></span>')
    const element2 = container.firstElementChild

    expect(element1).not.toBe(element2)

    renderCached(true, "C")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="C"></div>')
    expect(container.firstElementChild).toBe(element1)

    renderCached(false, "D")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<span v="D"></span>')
    expect(container.firstElementChild).toBe(element2)
  })

  test("renders non-TemplateResults", () => {
    render(html` ${cache("abc")} `, container) // prettier-ignore
    expect(container.innerHTML).toMatchStringHTMLStripComments("abc")
  })

  test("caches templates when switching against non-TemplateResults", () => {
    const renderCached = (condition: any, v: string) =>
      render(html` ${cache(condition ? html` <div v=${v}></div> ` : v)} `, container) // prettier-ignore

    renderCached(true, "A")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="A"></div>')
    const element1 = container.firstElementChild

    renderCached(false, "B")
    expect(container.innerHTML).toMatchStringHTMLStripComments("B")

    renderCached(true, "C")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="C"></div>')
    expect(container.firstElementChild).toBe(element1)

    renderCached(false, "D")
    expect(container.innerHTML).toMatchStringHTMLStripComments("D")
  })

  test("caches templates when switching against TemplateResult and undefined values", () => {
    const renderCached = (v: unknown) => render(html` <div>${cache(v)}</div> `, container) // prettier-ignore

    renderCached(html` A `) // prettier-ignore
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>A</div>")

    renderCached(undefined)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div></div>")

    renderCached( html` B ` ) // prettier-ignore
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>B</div>")
  })

  test("cache can be dynamic", () => {
    const renderMaybeCached = (condition: any, v: string) => render( html` ${condition ? cache( html` <div v=${v}></div> ` ) : v} `, container ) // prettier-ignore

    renderMaybeCached(true, "A")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="A"></div>')

    renderMaybeCached(false, "B")
    expect(container.innerHTML).toMatchStringHTMLStripComments("B")

    renderMaybeCached(true, "C")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div v="C"></div>')

    renderMaybeCached(false, "D")
    expect(container.innerHTML).toMatchStringHTMLStripComments("D")
  })

  test("cache can switch between TemplateResult and non-TemplateResult", () => {
    const renderCache = (bool: boolean) => render( html` ${cache( bool ? html` <p></p> ` : nothing )} `, container ) // prettier-ignore

    renderCache(true)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p></p>")
    renderCache(false)
    expect(container.innerHTML).toMatchStringHTMLStripComments("")
    renderCache(true)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p></p>")
    renderCache(true)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p></p>")
    renderCache(false)
    expect(container.innerHTML).toMatchStringHTMLStripComments("")
    renderCache(true)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p></p>")
    renderCache(false)
    expect(container.innerHTML).toMatchStringHTMLStripComments("")
    renderCache(false)
    expect(container.innerHTML).toMatchStringHTMLStripComments("")
  })

  test("async directives disconnect/reconnect when moved in/out of cache", () => {
    const disconnectable = directive(
      class extends AsyncDirective {
        log: string[] | undefined
        id: string | undefined
        render(log: string[], id: string) {
          this.log = log
          this.id = id
          this.log.push(`render-${this.id}`)
          return id
        }
        override disconnected() {
          this.log!.push(`disconnected-${this.id}`)
        }
        override reconnected() {
          this.log!.push(`reconnected-${this.id}`)
        }
      }
    )
    const renderCached = (log: string[], condition: boolean) =>
      render( html` <div> ${cache( condition ? html` <div>${disconnectable(log, "a")}</div> ` : html` <span>${disconnectable(log, "b")}</span> ` )} </div> `, container ) // prettier-ignore
    const log: string[] = []

    renderCached(log, true)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div><div>a</div></div>")
    expect(log).toEqual(["render-a"])

    log.length = 0
    renderCached(log, false)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div><span>b</span></div>")
    expect(log).toEqual(["disconnected-a", "render-b"])

    log.length = 0
    renderCached(log, true)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div><div>a</div></div>")
    expect(log).toEqual(["disconnected-b", "reconnected-a", "render-a"])

    log.length = 0
    renderCached(log, false)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div><span>b</span></div>")
    expect(log).toEqual(["disconnected-a", "reconnected-b", "render-b"])
  })
})
