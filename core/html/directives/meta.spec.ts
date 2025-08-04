import { describe, it, expect } from "bun:test"
import { meta } from "./meta"
import { html, render } from "../index"

describe("meta", () => {
  it("should render meta tag", () => {
    const metaContainer = document.createElement("div")
    const htmlContainer = document.createElement("div")
    const variable = "variable"
    const metaTemplate = meta("hash", (tag) => html`<${tag}>${variable}</${tag}>`)
    render(metaTemplate, metaContainer)

    const htmlTemplate = html`<meta-hash>${variable}</meta-hash>`
    render(htmlTemplate, htmlContainer)

    document.body.appendChild(metaContainer)
    document.body.appendChild(htmlContainer)

    expect(metaContainer.innerHTML).toBe(htmlContainer.innerHTML)
  })
})
