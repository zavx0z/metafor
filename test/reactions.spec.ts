import { test, expect, describe } from "bun:test"
import { messagesFixture } from "../fixture/message.ts"

describe("реакции", () => {
  test("MetaFor - базовый функционал", async () => {
    const { waitForMessages } = messagesFixture()

    // document.addEventListener("channel", (ev) => console.log(ev.detail))
    document.body.innerHTML = `<metafor-parent></metafor-parent>`

    MetaFor("child")
      .context((types) => ({
        param: types.string.optional(),
      }))
      .states({
        state_1: { state_2: { param: "param_1" } },
        state_2: {},
      })
      .core()
      .actions((action) => ({
        state_1: action(() => true).success(({ update }) => update({ param: "param_1" })),
      }))
      .reactions()
      .view({
        render: ({ html }) => html`<div></div>`,
      })

    MetaFor("parent")
      .context((types) => ({
        childAdded: types.boolean.optional(),
      }))
      .states({
        state_1: {},
      })
      .core()
      .actions()
      .reactions([
        [
          ["state_1"],
          {
            filter: ({ meta, patch }) => {
              // console.log(meta, patch)
              return meta.tag === "child"
            },
            update: ({ update }) => {
              update({ childAdded: true })
            },
          },
        ],
      ])
      .view({
        render: ({ html }) => html`<metafor-child></metafor-child>`,
      })

    const messages = await waitForMessages(1000)
    await Bun.sleep(500)
    console.log(messages)

    expect(document.body.innerHTML).toContain("<metafor-parent")
    expect(document.body.innerHTML).toContain('state="state_1"')
  })
})
