import { describe, it, expect } from "bun:test"
import { View } from "../../../view"

describe("Интерполяция core", () => {
  const core = { framework: "MetaFor" }
  const view = new View({
    render: ({ html, core }) => html`
      <div>
        <h1>Hello, ${core.framework}!</h1>
      </div>
    `,
  })
  const element = document.createElement("div")
  view.render({
    state: "",
    core,
    update: (() => {}) as any,
    context: {},
    element,
  })
  it("Корневой элемент div", () => {
    const div = element.querySelector("div")!
    expect(div, "должен быть отрендерен div").toBeDefined()
    expect(div.innerHTML, "должен быть отрендерен текст").toBe(`<h1>Hello, ${core.framework}!</h1>`)
  })
})
