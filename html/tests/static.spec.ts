import { render } from "../html"
import { html, literal, unsafeStatic } from "../static"
import { describe, it, expect, beforeEach } from "bun:test"

// Тесты для статических вставок в шаблоны

describe("static — статические вставки", () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement("div")
  })

  it("статическая вставка текста", () => {
    render(html`${literal`<p>Hello</p>`}`, container)
    // Если бы это была динамическая вставка, теги были бы экранированы
    expect(container.innerHTML, "innerHTML должен содержать <p>Hello</p>").toMatchStringHTMLStripComments(
      "<p>Hello</p>"
    )
  })

  it("статический атрибут", () => {
    render(html`<div class="${literal`cool`}"></div>`, container)
    expect(container.innerHTML, 'innerHTML должен содержать class="cool"').toMatchStringHTMLStripComments(
      '<div class="cool"></div>'
    )
    // TODO: проверить, что это действительно статический атрибут (пока невозможно через публичный API)
  })

  it("статическое имя тега", () => {
    const tagName = literal`div`
    render(html`<${tagName}>${"A"}</${tagName}>`, container)
    expect(container.innerHTML, "innerHTML должен содержать <div>A</div>").toMatchStringHTMLStripComments(
      "<div>A</div>"
    )
  })

  it("статическое имя атрибута", () => {
    render(html`<div ${literal`foo`}="${"bar"}"></div>`, container)
    expect(container.innerHTML, 'innerHTML должен содержать foo="bar"').toMatchStringHTMLStripComments(
      '<div foo="bar"></div>'
    )

    render(html`<div x-${literal`foo`}="${"bar"}"></div>`, container)
    expect(container.innerHTML, 'innerHTML должен содержать x-foo="bar"').toMatchStringHTMLStripComments(
      '<div x-foo="bar"></div>'
    )
  })

  it("статическое имя и значение атрибута", () => {
    render(html`<div ${literal`foo`}="${literal`bar`}"></div>`, container)
    expect(container.innerHTML, 'innerHTML должен содержать foo="bar"').toMatchStringHTMLStripComments(
      '<div foo="bar"></div>'
    )
  })

  it("динамическая вставка после статической", () => {
    render(html`${literal`<p>Hello</p>`}${"<p>World</p>"}`, container)
    expect(
      container.innerHTML,
      "innerHTML должен содержать <p>Hello</p>&lt;p&gt;World&lt;/p&gt;"
    ).toMatchStringHTMLStripComments("<p>Hello</p>&lt;p&gt;World&lt;/p&gt;")

    // Проверяем, что null корректно обрабатывается
    render(html`${literal`<p>Hello</p>`}${null}`, container)
    expect(container.innerHTML, "innerHTML должен содержать <p>Hello</p>").toMatchStringHTMLStripComments(
      "<p>Hello</p>"
    )
  })

  it("статические шаблоны различаются по значению", () => {
    // Шаблон с привязанным именем тега. Можно рендерить с разными тегами.
    const t = (tag: string, text: string) => html`<${unsafeStatic(tag)}>${text}</${unsafeStatic(tag)}>`

    render(t("div", "abc"), container)
    expect(container.innerHTML, "innerHTML должен содержать <div>abc</div>").toMatchStringHTMLStripComments(
      "<div>abc</div>"
    )
    const div = container.querySelector("div")
    expect(div, "div должен быть не null").not.toBeNull()

    render(t("div", "def"), container)
    expect(container.innerHTML, "innerHTML должен содержать <div>def</div>").toMatchStringHTMLStripComments(
      "<div>def</div>"
    )
    const div2 = container.querySelector("div")
    // Статические значения стабильны между рендерами, как и строки шаблона
    expect(div2, "div2 должен быть тем же, что и div").toBe(div)

    render(t("span", "abc"), container)
    // Новый статический шаблон — новый DOM
    expect(container.innerHTML, "innerHTML должен содержать <span>abc</span>").toMatchStringHTMLStripComments(
      "<span>abc</span>"
    )
    const span = container.querySelector("span")
    expect(span, "span должен быть не null").not.toBeNull()

    render(t("span", "def"), container)
    expect(container.innerHTML, "innerHTML должен содержать <span>def</span>").toMatchStringHTMLStripComments(
      "<span>def</span>"
    )
    const span2 = container.querySelector("span")
    expect(span2, "span2 должен быть тем же, что и span").toBe(span)

    render(t("div", "abc"), container)
    expect(container.innerHTML, "innerHTML должен содержать <div>abc</div>").toMatchStringHTMLStripComments(
      "<div>abc</div>"
    )
    const div3 = container.querySelector("div")
    // Нет кэширования по значению — новый DOM
    expect(div3, "div3 должен быть не равен div").not.toBe(div)
  })

  it("вложенные статические значения", () => {
    const start = literal`<${literal`sp${literal`an`}`}>`
    const end = literal`</${unsafeStatic("span")}>`
    render(html`<div>a${start}b${end}c</div>`, container)
    expect(
      container.innerHTML,
      "innerHTML должен содержать <div>a<span>b</span>c</div>"
    ).toMatchStringHTMLStripComments("<div>a<span>b</span>c</div>")
  })

  it("ошибка при вставке не-статических значений в literal", () => {
    expect(() => {
      literal`a${literal`bar`}b${"shouldthrow"}`
    }, "literal должен выбрасывать ошибку при не-статическом значении").toThrow()
  })

  describe("unsafe — небезопасные статические вставки", () => {
    it("статическое имя тега", () => {
      const tagName = unsafeStatic("div")
      render(html`<${tagName}>${"A"}</${tagName}>`, container)
      expect(container.innerHTML, "innerHTML должен содержать <div>A</div>").toMatchStringHTMLStripComments(
        "<div>A</div>"
      )
    })

    it("статическое имя атрибута", () => {
      render(html`<div ${unsafeStatic("foo")}="${"bar"}"></div>`, container)
      expect(container.innerHTML, 'innerHTML должен содержать foo="bar"').toMatchStringHTMLStripComments(
        '<div foo="bar"></div>'
      )

      render(html`<div x-${unsafeStatic("foo")}="${"bar"}"></div>`, container)
      expect(container.innerHTML, 'innerHTML должен содержать x-foo="bar"').toMatchStringHTMLStripComments(
        '<div x-foo="bar"></div>'
      )
    })
  })

  it("не рендерить простые spoofed static values", () => {
    const spoof = {
      ["_$staticValue$"]: "foo",
      r: {},
    }
    const template = html`<div>${spoof}</div>`
    render(template, container)
    expect(container.innerHTML, "innerHTML должен содержать [object Object]").toMatchStringHTMLStripComments(
      "<div>[object Object]</div>"
    )
  })

  it("static html не должен добавлять value для использованного static выражения", () => {
    const tagName = literal`div`
    const template = html`<${tagName}>${"foo"}</${tagName}>`
    expect(template.values.length, "values.length должен быть 1").toBe(1)
    const template2 = html`<${tagName}>${"foo"}</${tagName}>${"bar"}`
    expect(template2.values.length, "values.length должен быть 2").toBe(2)
  })
})
