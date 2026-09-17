import {describe, test, expect, beforeEach} from "bun:test"
import {noChange, render, html, nothing} from "../../html"
import type {CompiledTemplateResult, RenderOptions} from "../../types/html"
import type {TemplateResult} from "../../types/html"

describe("attributes", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })
  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
  const assertRender = (r: TemplateResult | CompiledTemplateResult, expected: string, options?: RenderOptions) => {
    const part = render(r, container, options)
    expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
    return part
  }

  test("отрисовка в атрибут с кавычками", () => {
    render(
      html`
        <div foo="${"bar"}"></div>
      `,
      container
    )
    assertContent('<div foo="bar"></div>')
  })

  test("отрисовка в атрибут без кавычек", () => {
    assertRender(
      html`
        <div foo=${"bar"}></div>
      `,
      '<div foo="bar"></div>'
    )
    assertRender(
      html`
          <div foo=${"bar"}/baz></div>`,
      '<div foo="bar/baz"></div>'
    )
  })

  test("отрисовка в атрибут без кавычек после несвязанного атрибута без кавычек", () => {
    assertRender(
      html`
        <div foo="bar" baz=${"qux"}></div>
      `,
      '<div foo="bar" baz="qux"></div>'
    )
    assertRender(
      html`
          <div foo=a/b baz=${"qux"}></div>`,
      '<div foo="a/b" baz="qux"></div>'
    )
  })

  test("отрисовка интерполяции в атрибут с кавычками", () => {
    render(
      html`
        <div foo="A${"B"}C"></div>
      `,
      container
    )
    assertContent('<div foo="ABC"></div>')
    render(
      html`
        <div foo="${"A"}B${"C"}"></div>
      `,
      container
    )
    assertContent('<div foo="ABC"></div>')
  })

  test("отрисовка интерполяции в атрибут без кавычек", () => {
    render(
      html`
        <div foo="A${"B"}C"></div>
      `,
      container
    )
    assertContent('<div foo="ABC"></div>')
    render(
      html`
        <div foo="${"A"}B${"C"}"></div>
      `,
      container
    )
    assertContent('<div foo="ABC"></div>')
  })

  test.skip("отрисовка интерполяции в атрибут без кавычек с символом неразрывного пробела", () => {
    assertRender(
      html`
        <div a=${"A"} ${"B"}></div>
      `,
      '<div a="A&nbsp;B"></div>'
    )
  })

  test("отрисовка интерполяции в атрибут с кавычками с символом неразрывного пробела", () => {
    assertRender(
      html`
        <div a="${"A"} ${"B"}"></div>
      `,
      '<div a="A B"></div>'
    )
  })

  test.skip("отрисовка нелатинского имени атрибута и интерполированных нелатинских значений без кавычек", () => {
    assertRender(
      html`
        <div ふ="ふ${"ふ"}ふ" フ="フ${"フ"}フ"></div>
      `,
      '<div ふ="ふふふ" フ="フフフ"></div>'
    )
  })

  test("отрисовка множественных привязок в атрибуте", () => {
    render(
      html`
        <div foo="a${"b"}c${"d"}e"></div>
      `,
      container
    )
    assertContent('<div foo="abcde"></div>')
  })

  test("отрисовка двух атрибутов на одном элементе", () => {
    const result = html`
      <div a="${1}" b="${2}"></div>
    `
    render(result, container)
    assertContent('<div a="1" b="2"></div>')
  })

  test("отрисовка множественных привязок в двух атрибутах", () => {
    render(
      html`
        <div foo="a${"b"}c${"d"}e" bar="a${"b"}c${"d"}e"></div>
      `,
      container
    )
    assertContent('<div foo="abcde" bar="abcde"></div>')
  })

  test("отрисовка Symbol в атрибуте", () => {
    render(
      html`
        <div foo=${Symbol("A")}></div>
      `,
      container
    )
    expect(container.querySelector("div")!.getAttribute("foo")).toContain("")
  })

  test.skip("отрисовка Symbol в массиве в атрибуте", () => {
    render(
      html`
        <div foo=${[Symbol("A")] as any}></div>
      `,
      container
    )
    expect(container.querySelector("div")!.getAttribute("foo")!).toContain("")
  })

  test("отрисовка привязки в атрибуте style", () => {
    const t = html`
      <div style="color: ${"red"}"></div>
    `
    render(t, container)
    assertContent('<div style="color: red"></div>')
  })

  test("отрисовка множественных привязок в атрибуте style", () => {
    const t = html`
      <div style="${"color"}: ${"red"}"></div>
    `
    render(t, container)
    assertContent('<div style="color: red"></div>')
  })

  test("отрисовка привязки в атрибуте class", () => {
    render(
      html`
        <div class="${"red"}"></div>
      `,
      container
    )
    assertContent('<div class="red"></div>')
  })

  test("отрисовка привязки в атрибуте value элемента input", () => {
    render(
      html`
        <input value="${"the-value"}" />
      `,
      container
    )
    assertContent('<input value="the-value">')
    expect(container.querySelector("input")!.value).toBe("the-value")
  })

  test("отрисовка регистрозависимого атрибута", () => {
    const size = 100
    render(
      html`
        <svg viewBox="0 0 ${size} ${size}"></svg>
      `,
      container
    )
    expect(container.innerHTML).includeStringHTMLStripComments('viewBox="0 0 100 100"')

    // Проверяем, что обрабатываются допустимые символы в имени атрибута, отличные от букв
    render(
      html`
        <svg view_Box="0 0 ${size} ${size}"></svg>
      `,
      container
    )
    expect(container.innerHTML).includeStringHTMLStripComments('view_Box="0 0 100 100"')
  })

  test("отрисовка в атрибут с выражением после литерала атрибута", () => {
    render(
      html`
        <div a="b" foo="${"bar"}"></div>
      `,
      container
    )
    // IE и Edge могут менять порядок атрибутов!
    expect(container.innerHTML).oneOfMatchStringHTMLStripComments([
      '<div a="b" foo="bar"></div>',
      '<div foo="bar" a="b"></div>'
    ])
  })

  test("отрисовка в атрибут с выражением перед литералом атрибута", () => {
    render(
      html`
        <div foo="${"bar"}" a="b"></div>
      `,
      container
    )
    // IE и Edge могут менять порядок атрибутов!
    expect(container.innerHTML).oneOfMatchStringHTMLStripComments([
      '<div a="b" foo="bar"></div>',
      '<div foo="bar" a="b"></div>'
    ])
  })

  // Регрессионный тест для исключения при разборе шаблона, вызванного переупорядочиванием атрибутов,
  // когда привязка атрибута предшествует литералу атрибута.
  test("отрисовка привязки атрибута после привязки атрибута, которая была перемещена", () => {
    render(
      html`
        <a href="${"foo"}" class="bar">
          <div id=${"a"}></div>
        </a>
      `,
      container
    )
    assertContent(`<a class="bar" href="foo"><div id="a"></div></a>`)
  })

  test("отрисовка привязанного атрибута без кавычек", () => {
    render(
      html`
        <div foo=${"bar"}></div>
      `,
      container
    )
    assertContent('<div foo="bar"></div>')
  })

  test("отрисовка множественных привязанных атрибутов", () => {
    render(
      html`
        <div foo="${"Foo"}" bar="${"Bar"}" baz=${"Baz"}></div>
      `,
      container
    )
    expect(container.innerHTML).oneOfMatchStringHTMLStripComments([
      '<div foo="Foo" bar="Bar" baz="Baz"></div>',
      '<div foo="Foo" baz="Baz" bar="Bar"></div>',
      '<div bar="Bar" foo="Foo" baz="Baz"></div>'
    ])
  })

  test("отрисовка множественных привязанных атрибутов без кавычек", () => {
    render(
      html`
        <div foo=${"Foo"} bar=${"Bar"} baz=${"Baz"}></div>
      `,
      container
    )
    expect(container.innerHTML).oneOfMatchStringHTMLStripComments([
      '<div foo="Foo" bar="Bar" baz="Baz"></div>',
      '<div foo="Foo" baz="Baz" bar="Bar"></div>',
      '<div bar="Bar" foo="Foo" baz="Baz"></div>'
    ])
  })

  test("отрисовка атрибута с множественными выражениями без кавычек", () => {
    render(
      html`
        <div foo="${"Foo"}${"Bar"}"></div>
      `,
      container
    )
    assertContent('<div foo="FooBar"></div>')
  })

  test("отрисовка в атрибуты со значениями, похожими на атрибуты", () => {
    render(
      html`
        <div foo="bar=${"foo"}"></div>
      `,
      container
    )
    assertContent('<div foo="bar=foo"></div>')
  })

  test("не вызывает функцию, привязанную к атрибуту", () => {
    const f = () => {
      throw new Error()
    }
    render(
      html`
        <div foo=${f as any}></div>
      `,
      container
    )
    const div = container.querySelector("div")!
    expect(div.hasAttribute("foo")).toBe(true)
  })

  test("отрисовка массива в атрибут", () => {
    render(
      html`
        <div foo=${["1", "2", "3"] as any}></div>
      `,
      container
    )
    assertContent('<div foo="1,2,3"></div>')
  })

  test("отрисовка в атрибут перед узлом", () => {
    render(
      html`
        <div foo="${"bar"}">${"baz"}</div>
      `,
      container
    )
    assertContent('<div foo="bar">baz</div>')
  })

  test("отрисовка в атрибут после узла", () => {
    render(
      html`
        <div>${"baz"}</div>
        <div foo="${"bar"}"></div>
      `,
      container
    )
    assertContent('<div>baz</div><div foo="bar"></div>')
  })

  test("отрисовка undefined в интерполированных атрибутах", () => {
    render(
      html`
        <div attribute="it's ${undefined}"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div attribute="it\'s "></div>')
  })

  test("отрисовка undefined в атрибутах", () => {
    render(
      html`
        <div attribute="${undefined as any}"></div>
      `,
      container
    )
    assertContent('<div attribute=""></div>')
  })

  test("отрисовка null в атрибутах", () => {
    render(
      html`
        <div attribute="${null as any}"></div>
      `,
      container
    )
    assertContent('<div attribute=""></div>')
  })

  test("отрисовка пустой строки в атрибутах", () => {
    render(
      html`
        <div attribute="${""}"></div>
      `,
      container
    )
    assertContent('<div attribute=""></div>')
  })

  test("отрисовка пустой строки в интерполированных атрибутах", () => {
    render(
      html`
        <div attribute="foo${""}"></div>
      `,
      container
    )
    assertContent('<div attribute="foo"></div>')
  })

  test("начальная отрисовка noChange в полностью контролируемом атрибуте", () => {
    render(
      html`
        <div attribute="${noChange as any}"></div>
      `,
      container
    )
    assertContent("<div></div>")
  })

  test("отрисовка noChange в атрибутах, сохраняет внешнее значение атрибута", () => {
    const go = (v: any) =>
      render(
        html`
          <div attribute="${v}"></div>
        `,
        container
      )
    go(noChange)
    assertContent("<div></div>")
    const div = container.querySelector("div")
    div?.setAttribute("attribute", "A")
    go(noChange)
    assertContent('<div attribute="A"></div>')
  })

  test("сигнал nothing удаляет атрибут", () => {
    const go = (v: any) => html`
      <div a=${v}></div>
    `
    render(go(nothing), container)
    assertContent("<div></div>")

    render(go("a"), container)
    assertContent('<div a="a"></div>')

    render(go(nothing), container)
    assertContent("<div></div>")
  })

  test("интерполированный сигнал nothing удаляет атрибут", () => {
    const go = (v: any) => html`
      <div a="A${v}"></div>
    `
    render(go("a"), container)
    assertContent('<div a="Aa"></div>')

    render(go(nothing), container)
    assertContent("<div></div>")
  })

  test("noChange работает", () => {
    const go = (v: any) =>
      render(
        html`
          <div foo=${v}></div>
        `,
        container
      )
    go("A")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="A"></div>')
    const observer = new MutationObserver(() => {})
    observer.observe(container, {attributes: true, subtree: true})

    go(noChange)
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="A"></div>')
    expect(observer.takeRecords()).toHaveLength(0)
  })

  test("noChange отрисовывается как пустая строка при использовании в интерполированных атрибутах", () => {
    const go = (a: any, b: any) =>
      render(
        html`
          <div foo="${a}:${b}"></div>
        `,
        container
      )

    go("A", noChange)
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="A:"></div>')

    go("A", "B")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="A:B"></div>')
    go(noChange, "C")
    expect(container.innerHTML).toMatchStringHTMLStripComments('<div foo="A:C"></div>')
  })
})
