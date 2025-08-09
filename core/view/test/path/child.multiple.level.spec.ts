import { messagesFixture } from "../../../../fixture/message"
import { MetaFor } from "../../../../web/metafor"
import { describe, it, expect } from "bun:test"
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
      render: ({ html, repeat }) => html`
        <meta-${child}></meta-${child}>
        <div>
            ${repeat(
              [1, 2, 3],
              (i) => i,
              () => html`<meta-${child}></meta-${child}>`
            )}
        </div>
        ${repeat(
          [1, 2, 3],
          (i) => i,
          () => html`<meta-${child}></meta-${child}>`
        )}
      `,
    })

  const { waitForMessages } = messagesFixture({ meta: root })
  document.body.innerHTML = `<meta-${root}></meta-${root}>`
  const parentElement = document.querySelector(`meta-${root}`)! as ActorInternal

  const messages = await waitForMessages(200)
})
