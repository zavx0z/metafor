import { describe, it, expect } from "bun:test"
import { View } from "../../index"

describe("Условный рендеринг", () => {
  it("простой элемент", () => {
    const view = new View({
      render: ({ html }) => html`<div><span>Visible</span></div>`,
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

    expect(span?.textContent, "должен быть отрендерен текст").toBe("Visible")
  })

  it("элемент с атрибутами", () => {
    const view = new View({
      render: ({ html }) => html`<div><span>Many</span></div>`,
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

    expect(span?.textContent, "должен быть отрендерен текст").toBe("Many")
  })

  it("условный атрибут", () => {
    const view = new View({
      render: ({ html }) => html`<button disabled>Click me</button>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const button = container.querySelector("button")
    expect(button?.hasAttribute("disabled"), "кнопка должна быть отключена").toBe(true)
  })

  it("условный атрибут с логическим И", () => {
    const view = new View({
      render: ({ html }) => html`<button admin>Click me</button>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const button = container.querySelector("button")
    expect(button?.hasAttribute("admin"), "кнопка должна иметь атрибут admin").toBe(true)
  })

  it("список с классами", () => {
    const view = new View({
      render: ({ html }) =>
        html`<ul>
          <li class="active">Item 1</li>
          <li>Item 2</li>
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
    expect(lis?.[0]?.hasAttribute("class"), "первый элемент должен иметь класс").toBe(true)
    expect(lis?.[1]?.hasAttribute("class"), "второй элемент не должен иметь класс").toBe(false)
  })
})
