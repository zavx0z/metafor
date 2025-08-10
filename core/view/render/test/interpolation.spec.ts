import { describe, it, expect } from "bun:test"
import { View } from "../../index"

describe("Интерполяция в рендере", () => {
  it("простой элемент", () => {
    const view = new View({
      render: ({ html }) => html`<div>Hello World</div>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const div = container.querySelector("div")
    expect(div?.textContent, "должен быть отрендерен текст").toBe("Hello World")
  })

  it("элемент с атрибутами", () => {
    const view = new View({
      render: ({ html }) => html`<div class="container" id="main">Content</div>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const div = container.querySelector("div")
    expect(div?.getAttribute("class"), "должен быть установлен class").toBe("container")
    expect(div?.getAttribute("id"), "должен быть установлен id").toBe("main")
  })

  it("вложенные элементы", () => {
    const view = new View({
      render: ({ html }) =>
        html`<div>
          <span>Hello</span>
          <p>World</p>
        </div>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const div = container.querySelector("div")
    const span = div?.querySelector("span")
    const p = div?.querySelector("p")

    expect(span?.textContent, "должен быть отрендерен span").toBe("Hello")
    expect(p?.textContent, "должен быть отрендерен p").toBe("World")
  })

  it("самозакрывающиеся теги", () => {
    const view = new View({
      render: ({ html }) => html`<div><img src="test.jpg" alt="Test" /><br /></div>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const div = container.querySelector("div")
    const img = div?.querySelector("img")
    const br = div?.querySelector("br")

    expect(img?.getAttribute("src"), "должен быть установлен src").toBe("test.jpg")
    expect(img?.getAttribute("alt"), "должен быть установлен alt").toBe("Test")
    expect(br, "должен быть отрендерен br").toBeDefined()
  })
})
