import { describe, it, expect } from "bun:test"
import { View } from "../../index.ts"
import { repeat } from "../../html/directives/repeat.ts"
import { templateCache } from "../../maps.ts"

describe("repeat", () => {
  const child = "child"
  const view = new View({
    render: ({ html, repeat }) => html`
      <div>
        ${repeat(
          [1, 2, 3],
          (i) => i,
          () => html`<meta-${child}></meta-${child}>`
        )}
      </div>
    `,
  })
  const template = view.html`
  <div><span></span>
    ${repeat(
      [1, 2, 3],
      (i) => i,
      () => view.html`<meta-${child}></meta-${child}>`
    )}
  </div>
`
  it("should render repeat", () => {
    view.render({
      state: "initial",
      context: {},
      core: {},
      shadow: document.createElement("div").attachShadow({ mode: "open" }),
      update: (() => {}) as any,
    })
    console.log(templateCache)
    expect(template).toMatchSnapshot()
  })
})
