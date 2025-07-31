import { render } from "../html"
import { html, literal, unsafeStatic } from "../static"
import { test, expect, beforeEach } from "bun:test"

let container: HTMLElement

beforeEach(() => {
  container = document.createElement("div")
})

test("Статическая вставка текста", () => {
  render(html`${literal`<p>Hello</p>`}`, container)
  // Если бы это была динамическая вставка, теги были бы экранированы
  expect(container.innerHTML, "innerHTML должен содержать <p>Hello</p>").toMatchStringHTMLStripComments(
    "<p>Hello</p>"
  )
})

test("Статический атрибут", () => {
  render(html`<div class="${literal`cool`}"></div>`, container)
  expect(container.innerHTML, 'innerHTML должен содержать class="cool"').toMatchStringHTMLStripComments(
    '<div class="cool"></div>'
  )
})

test("Статическое имя тега", () => {
  const tagName = literal`div`
  render(html`<${tagName}>${"A"}</${tagName}>`, container)
  expect(container.innerHTML, "innerHTML должен содержать <div>A</div>").toMatchStringHTMLStripComments(
    "<div>A</div>"
  )
}) 