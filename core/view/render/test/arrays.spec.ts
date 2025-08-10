import { describe, it, expect } from "bun:test"
import { View } from "../../index"

describe("Рендеринг массивов", () => {
  it("простой список", () => {
    const view = new View({
      render: ({ html }) =>
        html`<ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")

    expect(lis?.length, "должно быть 3 элемента списка").toBe(3)
    expect(lis?.[0]?.textContent, "первый элемент должен быть Item 1").toBe("Item 1")
    expect(lis?.[1]?.textContent, "второй элемент должен быть Item 2").toBe("Item 2")
    expect(lis?.[2]?.textContent, "третий элемент должен быть Item 3").toBe("Item 3")
  })

  it("список с атрибутами", () => {
    const view = new View({
      render: ({ html }) =>
        html`<div><button class="active">Button 1</button><button class="inactive">Button 2</button></div>`,
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
    const buttons = div?.querySelectorAll("button")

    expect(buttons?.length, "должно быть 2 кнопки").toBe(2)

    expect(buttons?.[0]?.getAttribute("class"), "первая кнопка должна быть active").toBe("active")
    expect(buttons?.[1]?.getAttribute("class"), "вторая кнопка должна быть inactive").toBe("inactive")
  })

  it("вложенные элементы", () => {
    const view = new View({
      render: ({ html }) => html`<div><span>Text 1</span><span>Text 2</span></div>`,
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
    const spans = div?.querySelectorAll("span")

    expect(spans?.length, "должно быть 2 элемента").toBe(2)
    expect(spans?.[0]?.textContent, "первый элемент должен быть Text 1").toBe("Text 1")
    expect(spans?.[1]?.textContent, "второй элемент должен быть Text 2").toBe("Text 2")
  })

  it("пустой контейнер", () => {
    const view = new View({
      render: ({ html }) => html`<ul></ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")

    expect(lis?.length, "не должно быть элементов списка").toBe(0)
  })
})
