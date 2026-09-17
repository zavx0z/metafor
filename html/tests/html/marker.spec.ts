import {beforeEach, describe, expect, test} from "bun:test"
import {html, nothing} from "../../html.js"
import {render} from "../../html.js"
import type {CompiledTemplateResult, RenderOptions, TemplateResult} from "../../types/html.js"

// У нас нет прямого доступа к DEV_MODE, но это достаточно хороший прокси.
const DEV_MODE = render.setSanitizer != null

/**
 * Эти тесты проверяют возможность вставки корректного маркера выражения
 * в HTML-строку до её разбора через `innerHTML`.
 * Некоторые тесты используют некорректный HTML, чтобы проверить
 * корректное (и без аварий) поведение в крайних случаях,
 * хотя точное поведение не определено.
 */
describe("вставка маркера", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })

  const assertRender = (r: TemplateResult | CompiledTemplateResult, expected: string, options?: RenderOptions) => {
    const part = render(r, container, options)
    expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
    return part
  }
  /**
   * Happy DOM не правильно обрабатывает некорректный HTML.
   * https://github.com/capricorn86/happy-dom/issues/1460#issuecomment-2628793622
   */
  test.skip("текст похожий на тег внутри текста", () => {
    assertRender(html`a <1a> ${"b"}`, "a &lt;1a&gt; b") // a<1a>b</1a>
    assertRender(html`a <-a> ${"b"}`, "a &lt;-a&gt; b") // a<-a>b</-a>
    assertRender(html`a<:a> ${"b"}`, "a &lt;:a&gt; b") //  a<a>b</a>
  })
  test.skip("тег через двоеточие", () => {
    assertRender(html`<x:foo>${"A"}</x:foo>`, "<x:foo>A</x:foo>") // <foo>A</foo>
  })

  test("только текст", () => {
    render(
      html`
        ${"A"}
      `,
      container
    )
    assertRender(
      html`
        ${"A"}
      `,
      "A"
    )
  })

  test("текст похожий на атрибут", () => {
    assertRender(
      html`
        a=${"A"}
      `,
      "a=A"
    )
  })

  test("< в тексте", () => {
    assertRender(
      html`
        a < ${"b"}
      `,
      "a &lt; b"
    )
  })

  test("дочерний текстовый элемент", () => {
    assertRender(
      html`
        <div>${"A"}</div>
      `,
      "<div>A</div>"
    )
  })
  test("Текстовый дочерний элемент различных имён тегов", () => {
    assertRender(html`<x-foo>${"A"}</x-foo>`, "<x-foo>A</x-foo>") // prettier-ignore
    assertRender(html`<x=foo>${"A"}</x=foo>`, "<x=foo>A</x=foo>") // prettier-ignore
    assertRender(html`<x1>${"A"}</x1>`, "<x1>A</x1>") // prettier-ignore
  })

  test("text after self-closing tag", () => {
    assertRender(
      html`
        <input />
        ${"A"}
      `,
      "<input>A"
    )
    assertRender(
      html`
        <!-- @ts-ignore -->
        <x-foo />
        ${"A"}
      `,
      "<!-- @ts-ignore --><x-foo>A</x-foo>"
    )
  })

  test("дочерний текст элемента с несвязанным атрибутом в кавычках", () => {
    assertRender(
      html`
        <div a="b">${"d"}</div>
      `,
      '<div a="b">d</div>'
    )

    render(
      html`
        <script a="b" type="foo">
          ${"d"}
        </script>
      `,
      container
    )
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<script a="b" type="foo">d</script>',
      '<script type="foo" a="b">d</script>'
    ])
  })

  test("дочерний текст элемента с несвязанным атрибутом без кавычек", () => {
    assertRender(
      html`
        <div a="b">${"d"}</div>
      `,
      '<div a="b">d</div>'
    )

    render(
      html`
        <script a="b" type="foo">
          ${"d"}
        </script>
      `,
      container
    )
    expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers([
      '<script a="b" type="foo">d</script>',
      '<script type="foo" a="b">d</script>'
    ])
  })

  test("отрисовка частей с пробелами после них", () => {
    assertRender(
      html`
        <div>${"foo"}</div>
      `,
      "<div>foo </div>"
    )
  })

  test("отрисовка частей похожих на атрибуты", () => {
    assertRender(
      html`
        <div>foo bar=${"baz"}</div>
      `,
      "<div>foo bar=baz</div>"
    )
  })

  test("отрисовка нескольких частей на элемент с сохранением пробелов", () => {
    assertRender(
      html`
        <div>${"foo"} ${"bar"}</div>
      `,
      "<div>foo bar</div>"
    )
  })

  test("отрисовка шаблонов с комментариями", () => {
    assertRender(
      html`
        <div>
          <!-- this is a comment -->
          <h1 class="${"foo"}">title</h1>
          <p>${"foo"}</p>
        </div>
      `,
      `
        <div>
          <!-- this is a comment -->
          <h1 class="foo">title</h1>
          <p>foo</p>
        </div>`
    )
  })

  test("текст после элемента", () => {
    assertRender(
      html`
        <div></div>
        ${"A"}
      `,
      "<div></div>A"
    )
  })

  test("отрисовка следующих шаблонов с предшествующими элементами", () => {
    assertRender(
      html`
        <a>${"foo"}</a>
        ${html`
          <h1>${"bar"}</h1>
        `}
      `,
      "<a>foo</a><h1>bar</h1>"
    )
  })

  test("отрисовка выражений с предшествующими элементами", () => {
    // This is nearly the same test case as above, but was causing a
    // different stack trace
    assertRender(
      html`
        <a>${"foo"}</a>
        ${"bar"}
      `,
      "<a>foo</a>bar"
    )
  })

  test("текст в элементах с необработанным текстом", () => {
    assertRender(
      html`
        <script type="foo">
          ${"A"}
        </script>
      `,
      '<script type="foo">A</script>'
    )
    assertRender(
      html`
        <style>
          ${"A"}
        </style>
      `,
      "<style>A</style>"
    )
    assertRender(
      html`
        <title>${"A"}</title>
      `,
      "<title>A</title>"
    )
    assertRender(
      html`
        <textarea>${"A"}</textarea>
      `,
      "<textarea>A</textarea>"
    )
  })

  test("текст в элементе с необработанным текстом после <", () => {
    // It doesn't matter much what marker we use in <script>, <style> and
    // <textarea> since comments aren't parsed and we have to search the text
    // anyway.
    assertRender(
      html`
        <script type="foo">
          i < j ${"A"}
        </script>
      `,
      '<script type="foo">i < j A</script>'
    )
  })

  test("текст в элементе с необработанным текстом после >", () => {
    assertRender(
      html`
        <script type="foo">
          i > j ${"A"}
        </script>
      `,
      '<script type="foo">i > j A</script>'
    )
  })

  test("текст в элементе с необработанным текстом внутри строки похожей на тег", () => {
    assertRender(
      html`
        <script type="foo">
          "<div a=${"A"}></div>";
        </script>
      `,
      '<script type="foo">"<div a=A></div>";</script>'
    )
  })

  test("отрисовка внутри <script>: единственный узел", () => {
    assertRender(
      html`
        <script type="foo">
          ${"foo"}
        </script>
      `,
      '<script type="foo">foo</script>'
    )
  })

  test("отрисовка внутри <script>: первый узел", () => {
    assertRender(
      html`
        <script type="foo">
          ${"foo"}A
        </script>
      `,
      '<script type="foo">fooA</script>'
    )
  })

  test("отрисовка внутри <script>: последний узел", () => {
    assertRender(
      html`
        <script type="foo">
          A${"foo"}
        </script>
      `,
      '<script type="foo">Afoo</script>'
    )
  })

  test("отрисовка внутри <script>: множественные привязки", () => {
    assertRender(
      html`
        <script type="foo">
          A${"foo"}B${"bar"}C
        </script>
      `,
      '<script type="foo">AfooBbarC</script>'
    )
  })

  test("отрисовка внутри <script>: похоже на атрибут", () => {
    assertRender(
      html`
        <script type="foo">
          a=${"foo"}
        </script>
      `,
      '<script type="foo">a=foo</script>'
    )
  })

  test("текст после элемента script", () => {
    assertRender(
      html`
        <script></script>
        ${"A"}
      `,
      "<script></script>A"
    )
  })

  test("текст после элемента script с привязкой", () => {
    assertRender(
      html`
        <script type="foo">
          ${"A"}
        </script>
        ${"B"}
      `,
      '<script type="foo">A</script>B'
    )
    assertRender(
      html`
        <script type="foo">
          1${"A"}
        </script>
        ${"B"}
      `,
      '<script type="foo">1A</script>B'
    )
    assertRender(
      html`
        <script type="foo">
          ${"A"}1
        </script>
        ${"B"}
      `,
      '<script type="foo">A1</script>B'
    )
    assertRender(
      html`
        <script type="foo">
          ${"A"}${"B"}
        </script>
        ${"C"}
      `,
      '<script type="foo">AB</script>C'
    )
    assertRender(
      html`
        <script type="foo">
          ${"A"}
        </script>
        <p>${"B"}</p>
      `,
      '<script type="foo">A</script><p>B</p>'
    )
  })

  test("текст после элемента style", () => {
    assertRender(
      html`
        <style></style>
        ${"A"}
      `,
      "<style></style>A"
    )
  })

  test("текст внутри элемента с необработанным текстом после другого необработанного тега", () => {
    assertRender(
      html`
        <script type="foo">
          <style></style>"<div a=${"A"}></div>"
        </script>
      `,
      '<script type="foo"><style></style>"<div a=A></div>"</script>'
    )
  })

  test("текст внутри элемента с необработанным текстом после другого закрывающего необработанного тега", () => {
    assertRender(
      html`
        <script type="foo">
          </style>"<div a=${"A"}></div>"
        </script>
      `,
      '<script type="foo"></style>"<div a=A></div>"</script>'
    )
  })

  test("отрисовка внутри элемента похожего на необработанный", () => {
    assertRender(
      html`
        <scriptx>${"foo"}</scriptx>
      `,
      "<scriptx>foo</scriptx>"
    )
  })

  test("атрибут без кавычек", () => {
    assertRender(
      html`
        <script></script>
        <div a=${"A"}></div>
      `,
      '<script></script><div a="A"></div>'
    )
  })

  test("атрибут в кавычках", () => {
    assertRender(
      html`
        <div a="${"A"}"></div>
      `,
      '<div a="A"></div>'
    )
    assertRender(
      html`
        <div abc="${"A"}"></div>
      `,
      '<div abc="A"></div>'
    )
    assertRender(
      html`
        <div abc="${"A"}"></div>
      `,
      '<div abc="A"></div>'
    )
    assertRender(
      html`
        <div abc="${"A"}/>"></div>
      `,
      '<div abc="A/>"></div>'
    )
    assertRender(
      html`
        <input value="${"A"}" />
      `,
      '<input value="A">'
    )
  })

  test("второй атрибут в кавычках", () => {
    assertRender(
      html`
        <div a="b" c="${"A"}"></div>
      `,
      '<div a="b" c="A"></div>'
    )
  })

  test("два атрибута в кавычках", () => {
    assertRender(
      html`
        <div a="${"A"}" b="${"A"}"></div>
      `,
      '<div a="A" b="A"></div>'
    )
  })

  test("два атрибута без кавычек", () => {
    assertRender(
      html`
        <div a=${"A"} b=${"A"}></div>
      `,
      '<div a="A" b="A"></div>'
    )
  })

  test("множественный атрибут в кавычках", () => {
    assertRender(
      html`
        <div a="${"A"} ${"A"}"></div>
      `,
      '<div a="A A"></div>'
    )
  })

  test("атрибут в кавычках с разметкой", () => {
    assertRender(
      html`
        <div a="<table>${"A"}"></div>
      `,
      '<div a="<table>A"></div>'
    )
  })

  test("текст после связанного атрибута в кавычках", () => {
    assertRender(
      html`
        <div a="${"A"}">${"A"}</div>
      `,
      '<div a="A">A</div>'
    )
    assertRender(
      html`
        <script type="foo" a="${"A"}">
          ${"A"}
        </script>
      `,
      '<script type="foo" a="A">A</script>'
    )
  })

  test("текст после связанного атрибута без кавычек", () => {
    assertRender(
      html`
        <div a=${"A"}>${"A"}</div>
      `,
      '<div a="A">A</div>'
    )
    assertRender(
      html`
        <script type="foo" a=${"A"}>
          ${"A"}
        </script>
      `,
      '<script type="foo" a="A">A</script>'
    )
  })

  test("внутри открывающего тега", () => {
    assertRender(
      html`
        <div ${`a`}></div>
      `,
      "<div></div>"
    )
  })

  test("внутри открывающего тега x2", () => {
    // We don't support multiple attribute-position bindings yet, so just
    // ensure this parses ok
    assertRender(
      html`
        <div ${`a`} ${`a`}></div>
      `,
      "<div></div>"
    )
  })

  test("внутри открывающего тега после атрибута в кавычках", () => {
    assertRender(
      html`
        <div a="b" ${`c`}></div>
      `,
      '<div a="b"></div>'
    )
    assertRender(
      html`
        <script a="b" ${`c`}></script>
      `,
      '<script a="b"></script>'
    )
  })

  test("внутри открывающего тега после атрибута без кавычек", () => {
    // prettier-ignore
    assertRender(html`
      <div a=b ${`c`}></div>`, '<div a="b"></div>')
  })

  test("внутри открывающего тега перед атрибутом без кавычек", () => {
    // bound attributes always appear after static attributes
    assertRender(
      html`
        <div ${`c`} a="b"></div>
      `,
      '<div a="b"></div>'
    )
  })

  test("внутри открывающего тега перед атрибутом в кавычках", () => {
    // bound attributes always appear after static attributes
    assertRender(
      html`
        <div ${`c`} a="b"></div>
      `,
      '<div a="b"></div>'
    )
  })

  test('"динамическое" имя тега', () => {
    const template = html`<${"A"}></${"A"}>`
    if (DEV_MODE) {
      expect(() => render(template, container)).toThrow()
    } else {
      render(template, container)
      expect(container.innerHTML).toMatchStringHTML("<></>")
    }
  })

  test('некорректное "динамическое" имя тега', () => {
    // `</ ` starts a comment
    const template = html`<${"A"}></ ${"A"}>`
    if (DEV_MODE) {
      expect(() => render(template, container)).toThrow()
    } else {
      render(template, container)
      expect(container.innerHTML).oneOfMatchStringHTMLStripMarkers("<><!-- --></>")
    }
  })

  test.skip("привязка после имени закрывающего тега", () => {
    assertRender(html`<div></div ${"A"}>`, "<div></div>") // prettier-ignore "<div>&lt;/divlit$662953791$0&gt;</div>"
  })

  test("комментарий", () => {
    render(html`<!--${"A"}-->`, container) // prettier-ignore
    // Удаляем только текст маркера (а не весь комментарий,
    // как это делает stripExpressionMarkers), чтобы тест работал
    // как в runtime, так и в скомпилированных шаблонах.
    expect(container.innerHTML.replace(/atom\$[0-9]+\$/g, "")).toMatchStringHTML("<!----><!---->")
  })

  test("комментарий с содержимым похожим на атрибут", () => {
    render(
      html`
        <!-- a=${"A"}-->
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<!-- a=-->")
  })

  test("комментарий с содержимым похожим на элемент", () => {
    render(
      html`
        <!-- <div>${"A"}</div> -->
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<!-- <div></div> -->")
  })

  test("текст после комментария", () => {
    assertRender(
      html`
        <!-- -->
        ${"A"}
      `,
      "<!-- -->A"
    )
  })

  test("отрисовка после существующего содержимого", () => {
    container.appendChild(document.createElement("div"))
    assertRender(
      html`
        <span></span>
      `,
      "<div></div><span></span>"
    )
  })

  test("отрисовка/обновление перед `renderBefore`, если указан", () => {
    const renderBefore = container.appendChild(document.createElement("div"))
    const template = html`
      <span></span>
    `
    assertRender(template, "<span></span><div></div>", {
      renderBefore
    })
    // Ensure re-render updates rather than re-rendering.
    const containerChildNodes = Array.from(container.childNodes)
    assertRender(template, "<span></span><div></div>", {
      renderBefore
    })
    expect(Array.from(container.childNodes)).toEqual(containerChildNodes)
    // assert.sameMembers(Array.from(container.childNodes), containerChildNodes)
  })

  test("отрисовка/обновление одного шаблона перед разными узлами `renderBefore`", () => {
    const renderBefore1 = container.appendChild(document.createElement("div"))
    const renderBefore2 = container.appendChild(document.createElement("div"))
    const template = html`
      <span></span>
    `
    assertRender(template, "<span></span><div></div><div></div>", {
      renderBefore: renderBefore1
    })
    const renderedNode1 = container.querySelector("span")
    assertRender(template, "<span></span><div></div><span></span><div></div>", {
      renderBefore: renderBefore2
    })
    const renderedNode2 = container.querySelector("span:last-of-type")
    // Ensure updates are handled as expected.
    assertRender(template, "<span></span><div></div><span></span><div></div>", {
      renderBefore: renderBefore1
    })
    expect(container.querySelector("span")).toBe(renderedNode1)
    expect(container.querySelector("span:last-of-type")).toBe(renderedNode2)
    assertRender(template, "<span></span><div></div><span></span><div></div>", {
      renderBefore: renderBefore2
    })
    expect(container.querySelector("span")).toBe(renderedNode1)
    expect(container.querySelector("span:last-of-type")).toBe(renderedNode2)
  })

  test("отрисовка/обновление при указании или отсутствии узла `renderBefore`", () => {
    const template = html`
      <span></span>
    `
    const renderBefore = container.appendChild(document.createElement("div"))
    assertRender(template, "<div></div><span></span>")
    const containerRenderedNode = container.querySelector("span")
    assertRender(template, "<span></span><div></div><span></span>", {
      renderBefore
    })
    const beforeRenderedNode = container.querySelector("span")
    // Ensure re-render updates rather than re-rendering.
    assertRender(template, "<span></span><div></div><span></span>")
    expect(container.querySelector("span:last-of-type")).toBe(containerRenderedNode)
    expect(container.querySelector("span")).toBe(beforeRenderedNode)
    assertRender(template, "<span></span><div></div><span></span>", {
      renderBefore
    })
    expect(container.querySelector("span:last-of-type")).toBe(containerRenderedNode)
    expect(container.querySelector("span")).toBe(beforeRenderedNode)
  })

  test("последовательные выражения", () => {
    const template = (a: unknown, b: unknown) =>
      html`
        ${html`
          ${a}
        `}${html`
          ${b}
        `}
      `
    assertRender(template("a", "b"), "ab")
    assertRender(template(nothing, "b"), "b")
    assertRender(template(nothing, nothing), "")
    assertRender(template("a", "b"), "ab")
  })
})
