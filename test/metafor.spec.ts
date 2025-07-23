import { test, expect } from "bun:test"
import { MetaFor } from "../metafor.ts"
import { messagesFixture } from "../fixture/message.ts"

test("MetaFor - базовый функционал", async () => {
  const { waitForMessages } = messagesFixture({ meta: "test" })

  document.body.innerHTML = `<metafor-test></metafor-test>`

  MetaFor("test")
    .context((types) => ({
      name: types.string.required("Anonymous"),
      isActive: types.boolean.required(false),
    }))
    .states({
      anonymous: {
        loading: {},
      },
      loading: {
        anonymous: {},
      },
    })
    .actions((action) => ({
      anonymous: action(({ context }) => {
        const name = context.name === "Anonymous" ? "User" : context.name
        return { name, age: 18 }
      })
        .success(({ update, data }) => update({ name: data.name, isActive: true }))
        .error(({ update, error }) => update({ name: error.message })),
      loading: action(({ context }) => {
        return { name: context.name }
      }).error(({ update, error }) => update({ name: error.message })),
    }))
    .view({
      render: ({ context, html }) => html`<div>${context.name}</div>`,
    })

  const element = document.querySelector("metafor-test")
  expect(element, "Компонент должен быть зарегистрирован в customElements").toBeDefined()
  expect(customElements.get("metafor-test"), "Компонент должен быть зарегистрирован в customElements").toBeDefined()
  const messages = await waitForMessages(400)
})
