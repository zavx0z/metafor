import {render, html} from "../../html"
import {beforeEach, describe, expect, test} from "bun:test"
import {stripExpressionMarkers} from "@pkg/fixtures/expectExtend"

describe(`don't render simple spoof template results`, () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
  })
  test(`don't render simple spoof template results`, () => {
    const spoof = {
      ["_$atomType$"]: 1,
      strings: ["<div>spoofed string</div>"],
      values: []
    }
    const template = html`
      <div>${spoof}</div>
    `
    let threwError = false
    try {
      render(template, container)
    } catch {
      threwError = true
    }
    expect(stripExpressionMarkers(container.innerHTML)).toBe("")
    expect(threwError).toBe(true)
  })
})
