import { render } from "../html"
import { html, literal } from "../static"
import { test, expect, beforeEach } from "bun:test"

let container: HTMLElement

beforeEach(() => {
  container = document.createElement("div")
})

test("Статическое имя атрибута", () => {
  render(html`<div ${literal`foo`}="${"bar"}"></div>`, container)
  expect(container.innerHTML, 'innerHTML должен содержать foo="bar"').toMatchStringHTMLStripComments(
    '<div foo="bar"></div>'
  )

  render(html`<div x-${literal`foo`}="${"bar"}"></div>`, container)
  expect(container.innerHTML, 'innerHTML должен содержать x-foo="bar"').toMatchStringHTMLStripComments(
    '<div x-foo="bar"></div>'
  )
})

test("Статическое имя и значение атрибута", () => {
  render(html`<div ${literal`foo`}="${literal`bar`}"></div>`, container)
  expect(container.innerHTML, 'innerHTML должен содержать foo="bar"').toMatchStringHTMLStripComments(
    '<div foo="bar"></div>'
  )
}) 