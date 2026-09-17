import {describe, expect, test} from "bun:test"
import {render} from "../html.js"
import {html, literal, unsafeStatic} from "../static.js"


describe("Статические", () => {
  const container = document.createElement("div")

  test("Статическая привязка текста", () => {
    render(
      html`
        ${literal`<p>Hello</p>`}
      `,
      container
    )
    // Если бы это была динамическая привязка, теги были бы экранированы
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p>Hello</p>")
  })

  test("Статическая привязка атрибута", () => {
    render(
      html`
        <div class="${literal`cool`}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div class="cool"></div>')
    // TODO: проверить, что это действительно статично. В настоящее время это невозможно с публичным API
  })

  test("Статическая привязка тега", () => {
    const tagName = literal`div`
    render(html`<${tagName}>${"A"}</${tagName}>`, container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>A</div>")
  })

  test("Статическая привязка атрибута", () => {
    render(
      html`
        <div ${literal`foo`}="${"bar"}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="bar"></div>')

    render(
      html`
        <div x-${literal`foo`}="${"bar"}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div x-foo="bar"></div>')
  })

  test("Статическая привязка имени атрибута", () => {
    render(
      html`
        <div ${literal`foo`}="${literal`bar`}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="bar"></div>')
  })

  test("Динамическая привязка после статической привязки текста", () => {
    render(
      html`
        ${literal`<p>Hello</p>`}${"<p>World</p>"}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p>Hello</p>&lt;p&gt;World&lt;/p&gt;")
    // Убедиться, что `null` обрабатывается
    render(
      html`
        ${literal`<p>Hello</p>`}${null}
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments("<p>Hello</p>")
  })

  test("Статические привязки индексируются статическими значениями", () => {
    // Шаблон с привязанным именем тега. Мы должны быть в состоянии перерендерить
    // этот шаблон с разными именами тегов и иметь имена тегов обновлены.
    // Новые имена тегов будут действовать как разные шаблоны.
    const t = (tag: string, text: string) => html` <${unsafeStatic(tag)}>${text}</${unsafeStatic(tag)}> `
    render(t("div", "abc"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>abc</div>")
    const div = container.querySelector("div")
    expect(div).not.toBeNull()

    render(t("div", "def"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>def</div>")
    const div2 = container.querySelector("div")
    // Статические значения стабильны между рендерами, как и статические шаблонные строки
    expect(div2).toBe(div)

    render(t("span", "abc"), container)
    // Рендеринг с новым статическим значением должен работать, хотя он перерендеривается
    // поскольку у нас новая шаблонная строка.
    expect(container.innerHTML).toMatchStringHTMLStripComments("<span>abc</span>")
    const span = container.querySelector("span")
    expect(span).not.toBeNull()

    render(t("span", "def"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<span>def</span>")
    const span2 = container.querySelector("span")
    expect(span2).toBe(span)

    render(t("div", "abc"), container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>abc</div>")
    const div3 = container.querySelector("div")
    // Статические значения не имеют никакого кэширующего поведения. Рендеринг с
    // ранее использованным значением не восстанавливает статический DOM
    expect(div3).not.toBe(div)
  })

  test("Вставка статических значений в статические", () => {
    const start = literal`<${literal`sp${literal`an`}`}>`
    const end = literal`</${unsafeStatic("span")}>`
    render(
      html`
        <div>a${start}b${end}c</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>a<span>b</span>c</div>")
  })

  test("Вставка нестатических значений в статические вызывает ошибку", () => {
    expect(() => {
      literal`a${literal`bar`}b${"shouldthrow"}`
    }).toThrow()
  })

  describe("Небезопасный", () => {
    test("Статическая привязка тега", () => {
      const tagName = unsafeStatic("div")
      render(
        html`
        <${tagName}>${"A"}</${tagName}>`,
        container
      )
      expect(container.innerHTML).toMatchStringHTMLStripComments("<div>A</div>")
    })

    test("Статическая привязка имени атрибута", () => {
      render(
        html`
          <div ${unsafeStatic("foo")}="${"bar"}"></div>
        `,
        container
      )
      expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="bar"></div>')
      render(
        html`
          <div x-${unsafeStatic("foo")}="${"bar"}"></div>
        `,
        container
      )
      expect(container.innerHTML).toMatchStringHTMLStripComments('<div x-foo="bar"></div>')
    })
  })

  test("Не рендерить простое поддельное статическое значение", () => {
    const spoof = {["_$staticValue$"]: "foo", r: {}}
    const template = html`
      <div>${spoof}</div>
    `
    render(template, container)
    expect(container.innerHTML).toMatchStringHTMLStripComments("<div>[object Object]</div>")
  })

  test("статический html не должен добавлять значение для использованного статического выражения", () => {
    const tagName = literal`div`
    const template = html`
      <${tagName}>${"foo"}</${tagName}>`
    expect(template.values.length).toBe(1)
    const template2 = html`
      <${tagName}>${"foo"}</${tagName}>${"bar"}`
    expect(template2.values.length).toBe(2)
  })
})
