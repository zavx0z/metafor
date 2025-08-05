import { beforeEach, describe, expect, test } from "bun:test"
import { render, html } from "../.."

describe(`не рендерит простые поддельные результаты шаблонов`, () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
  })
  test(`не рендерит простые поддельные результаты шаблонов`, () => {
    const spoof = {
      ["_$htmlType$"]: 1,
      strings: ["<div>spoofed string</div>"],
      values: [],
    }
    const template = html` <div>${spoof}</div> `
    let threwError = false
    try {
      render(template, container)
    } catch {
      threwError = true
    }
    expect(container.innerHTML).toMatchStringHTMLStripComments("")
    expect(threwError).toBe(true)
  })
})
