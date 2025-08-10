import { describe, it, expect } from "bun:test"
import { View } from "../../index"
import { Context } from "../../../context"

describe("Интерполяция контекста", () => {
  const { context: ctx, update: upd } = new Context((t) => ({
    text: t.string.required("MetaFor"),
    className: t.string.required("context-class"),
    id: t.string.required("main"),
    visible: t.boolean.required(true),
    disabled: t.boolean.required(true),
    list: t.array.required(["item1", "item2", "item3"]),
    enum: t.enum("div", "span", "p").required("div"),
  }))

  const container = document.createElement("div")

  const view = new View({
    render: ({ html, context }) =>
      html` <div class=${context.className} id="${context.id}" data-text="${context.text}">
        <img
          class="image ${context.className}-image"
          src="test.jpg"
          ${context.visible ? "visible" : "hidden"}
          alt="${context.text}" />
        <br />
        <button class="button-${context.className} ${context.className}-button" ${context.disabled && "disabled"}>
          ${context.text}
        </button>
        <ul>
          ${context.list.map((item: string) => html`<li>${item}</li>`)}
        </ul>
        ${context.enum === "div"
          ? html`<div class="enum">enum element div</div>`
          : context.enum === "span"
          ? html`<span class="enum">enum element span</span>`
          : context.enum === "p"
          ? html`<p class="enum">enum element p</p>`
          : null}
      </div>`,
  })
  view.render({
    state: "",
    context: ctx,
    core: {},
    update: upd,
    element: container,
  })

  it("корневой элемент div", () => {
    const div = container.querySelector("div")!
    expect(div, "должен быть отрендерен div").toBeDefined()
    expect(div.getAttribute("class"), "должен быть установлен class").toBe(ctx.className)
    expect(div.getAttribute("id"), "должен быть установлен id").toBe(ctx.id)
    expect(div.getAttribute("data-text"), "должен быть установлен data-атрибут").toBe(ctx.text)
  })
  it("ребёнок img с самозакрывающимся тегом", () => {
    const img = container.querySelector("img")!
    expect(img, "должен быть отрендерен img").toBeDefined()
    expect(img.getAttribute("alt"), "должен быть установлен alt").toBe(ctx.text)
    expect(img.getAttribute("class"), "должен содержать class").toContain(`${ctx.className}-image`)
  })
  it("ребёнок button", () => {
    const button = container.querySelector("button")!
    expect(button, "должен быть отрендерен button").toBeDefined()
    expect(button.hasAttribute("disabled"), "должен быть установлен disabled").toBe(ctx.disabled)
    expect(button.textContent, "должен быть отрендерен текст").toBe(ctx.text)
  })
  it.todo("ребёнок button с интерполяцией `button-${ctx.className} ${ctx.className}-button`", () => {
    const button = container.querySelector("button")!
    expect(button, "должен быть отрендерен button").toBeDefined()
    expect(button.getAttribute("class"), "должен содержать интерполированный class").toBe(
      `button-${ctx.className} ${ctx.className}-button`
    )
  })
  it("ребёнок ul", () => {
    const ul = container.querySelector("ul")!
    expect(ul, "должен быть отрендерен ul").toBeDefined()
    expect(ul.children.length, "должно быть 3 элемента").toBe(3)
    expect(ul.children[0]?.textContent, "должен быть отрендерен текст").toBe(ctx.list[0]!)
    expect(ul.children[1]?.textContent, "должен быть отрендерен текст").toBe(ctx.list[1]!)
    expect(ul.children[2]?.textContent, "должен быть отрендерен текст").toBe(ctx.list[2]!)
  })
  it("тренарная интерполяция", () => {
    const elEnum = container.querySelector(".enum")!
    expect(elEnum, "должен быть отрендерен элемент").toBeDefined()
    expect(elEnum.textContent, "должен быть отрендерен текст").toBe("enum element div")
  })
})
