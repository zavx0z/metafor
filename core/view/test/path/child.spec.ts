import { describe, it, expect } from "bun:test"
import { MetaFor } from "../../../../web/metafor"
import { messagesFixture } from "../../../../fixture/message"
import type { ActorInternal } from "../../../index.t"

describe("Путь дочернего актора", async () => {
  const child = MetaFor("child")
    .context(() => ({}))
    .states({})
    .core()
    .processes()
    .reactions()
    .view({
      render: ({ html }) => html`<div>child</div>`,
    })
  const root = MetaFor("root")
    .context(() => ({}))
    .states({})
    .core()
    .processes()
    .reactions()
    .view({
      render: ({ html, repeat }) =>
        html`${repeat(
          [1, 2, 3],
          (i) => i,
          () => html`<meta-${child}></meta-${child}>`
        )}`,
    })

  const { waitForMessages } = messagesFixture({ meta: child })
  document.body.innerHTML = `<meta-${root}></meta-${root}>`
  const parentElement = document.querySelector(`meta-${root}`)! as ActorInternal

  const messages = await waitForMessages(200)
  const { patches } = messages[0]!
  const patch = patches[0]!

  it("в патче добавления дочернего актора, должен быть путь", () => {
    expect(patch.path, "должен содержать путь").toBeDefined()
    expect(patch.path, "должен быть строкой").toBeString()
  })

  it("путь дочернего актора должен содержать путь родителя", () => {
    expect(patch.path, "должен содержать путь до актора").toContain("/" + parentElement.__path.join("/"))
  })
  it("путь дочернего актора должен содержать имя актора", () => {
    expect(patch.path, "должен содержать имя актора").toContain("/child")
  })
})
