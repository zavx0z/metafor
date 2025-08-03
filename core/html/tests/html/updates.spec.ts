import { beforeEach, describe, expect, test } from "bun:test"
import { html, render } from "../.."

describe("обновления", () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement("div")
  })

  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)

  test("проверяет изменения простых значений", () => {
    const foo = "aaa"

    const t = () => html` <div>${foo}</div> `

    render(t(), container)
    assertContent("<div>aaa</div>")
    const text = container.querySelector("div")!
    expect(text.textContent).toBe("aaa")

    // Устанавливаем textContent вручную (не нарушая узел-маркер части).
    // Поскольку @metafor/html не проверяет изменения против реального DOM, а против
    // предыдущих значений частей, это изменение должно сохраниться через
    // следующий рендер с тем же значением.
    text.lastChild!.textContent = "bbb"
    expect(text.textContent).toBe("bbb")
    assertContent("<div>bbb</div>")

    // Повторный рендер с тем же содержимым, должен быть no-op
    render(t(), container)
    assertContent("<div>bbb</div>")
    const text2 = container.querySelector("div")!

    // Следующий узел должен быть тем же самым
    expect(text).toBe(text2)
  })

  test("проверяет изменения значений узлов", async () => {
    const node = document.createElement("div")
    const t = () => html` ${node} `

    const observer = new MutationObserver(() => {})
    observer.observe(container, { childList: true, subtree: true })

    assertContent("")
    render(t(), container)
    assertContent("<div></div>")

    const elementNodes: Node[] = []
    let mutationRecords: MutationRecord[] = observer.takeRecords()
    for (const record of mutationRecords) {
      elementNodes.push(...Array.from(record.addedNodes).filter((n) => n.nodeType === Node.ELEMENT_NODE))
    }
    expect(elementNodes.length).toBe(1)

    mutationRecords = []
    render(t(), container)
    assertContent("<div></div>")
    mutationRecords = observer.takeRecords()
    expect(mutationRecords.length).toBe(0)
  })

  test("рендерит в контейнер и обновляет его", () => {
    let foo = "aaa"

    const t = () => html` <div>${foo}</div> `

    render(t(), container)
    assertContent("<div>aaa</div>")
    const div = container.querySelector("div")!
    expect(div.tagName).toBe("DIV")

    foo = "bbb"
    render(t(), container)
    assertContent("<div>bbb</div>")
    const div2 = container.querySelector("div")!
    // проверяем, что изменилась только часть
    expect(div).toBe(div2)
  })

  test("рендерит в контейнер и обновляет соседние части", () => {
    let foo = "foo"
    const bar = "bar"

    const t = () => html` <div>${foo}${bar}</div> `

    render(t(), container)
    assertContent("<div>foobar</div>")

    foo = "bbb"
    render(t(), container)
    assertContent("<div>bbbbar</div>")
  })

  test("рендерит и обновляет атрибуты", () => {
    let foo = "foo"
    const bar = "bar"

    const t = () => html` <div a="${foo}:${bar}"></div> `

    render(t(), container)
    assertContent('<div a="foo:bar"></div>')

    foo = "bbb"
    render(t(), container)
    assertContent('<div a="bbb:bar"></div>')
  })

  test("обновляет вложенные шаблоны", () => {
    let foo = "foo"
    const bar = "bar"
    const baz = "baz"

    const t = (x: boolean) => {
      let partial
      if (x) {
        partial = html` <h1>${foo}</h1> `
      } else {
        partial = html` <h2>${bar}</h2> `
      }

      return html` ${partial}${baz} `
    }

    render(t(true), container)
    assertContent("<h1>foo</h1>baz")

    foo = "bbb"
    render(t(true), container)
    assertContent("<h1>bbb</h1>baz")

    render(t(false), container)
    assertContent("<h2>bar</h2>baz")
  })

  test("обновляет элемент", () => {
    let child: any = document.createElement("p")
    const t = () => html`
      <div>
        ${child}
        <div></div>
      </div>
    `
    render(t(), container)
    assertContent("<div><p></p><div></div></div>")

    child = undefined
    render(t(), container)
    assertContent("<div><div></div></div>")

    child = document.createTextNode("foo")
    render(t(), container)
    assertContent("<div>foo<div></div></div>")
  })

  test("перезаписывает существующий TemplateInstance, если он существует и не имеет соответствующего Template", () => {
    render(html` <div>foo</div> `, container)

    expect(container.children.length).toBe(1)
    const fooDiv = container.children[0]!
    expect(fooDiv.textContent).toBe("foo")

    render(html` <div>bar</div> `, container)

    expect(container.children.length).toBe(1)
    const barDiv = container.children[0]!
    expect(barDiv.textContent).toBe("bar")

    expect(fooDiv).not.toBe(barDiv)
  })
})
