import { describe, it, expect } from "bun:test"
import { View } from "../../index"

describe("Рендер", () => {
  it("простой элемент", () => {
    const view = new View({
      render: ({ html }) => html`<div>Hello</div>`,
    })
    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: document.body,
    })

    const div = document.body.querySelector("div")
    expect(div).toBeDefined()
    expect(div?.textContent).toBe("Hello")
  })
})
