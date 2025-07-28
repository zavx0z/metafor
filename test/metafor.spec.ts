import { test, expect } from "bun:test"
import { MetaFor } from "../metafor.ts"
import { messagesFixture } from "../fixture/message.ts"

test.todo("MetaFor - базовый функционал", async () => {
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
    .core()
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
    .reactions()
    .view({
      render: ({ context, html }) => html`<div>${context.name}</div>`,
    })

  const element = document.querySelector("metafor-test")
  expect(element, "Компонент должен быть зарегистрирован в customElements").toBeDefined()
  expect(customElements.get("metafor-test"), "Компонент должен быть зарегистрирован в customElements").toBeDefined()
  const messages = await waitForMessages(400)
})

test("MetaFor - интеграция с реакциями", async () => {
  let called = false

  MetaFor("react")
    .context((types) => ({ value: types.number.required(0) }))
    .states({
      idle: {},
      active: {},
    })
    .core()
    .actions((action) => ({
      idle: action(({ context }) => ({ value: context.value })).success(({ update, data }) => update(data)),
    }))
    .reactions((filter) => [
      [
        ["idle"],
        filter(({ meta }) => meta.tag === "test").equal(({ context, update }) => {
          called = true
          update({ value: context.value + 1 })
        }),
      ],
    ])
    .view({
      render: ({ context, html }) => html`<div>${context.value}</div>`,
    })

  document.body.innerHTML = `<metafor-react></metafor-react>`
  const element = document.querySelector("metafor-react") as any
  expect(element, "Компонент должен быть создан").toBeDefined()
  // Имитируем входящее сообщение в канал
  element.dispatchEvent(
    new CustomEvent("channel", {
      detail: { meta: { tag: "test" }, patch: { changed: true } },
      bubbles: true,
      composed: true,
    })
  )
  await Bun.sleep(10)
  expect(called, "Реакция должна быть вызвана").toBe(true)
  expect(element.getSnapshot().context.value, "Контекст должен быть обновлён реакцией").toBe(1)

  // Проверяем, что filter работает
  called = false
  element.dispatchEvent(
    new CustomEvent("channel", {
      detail: { meta: { tag: "other" }, patch: { changed: true } },
      bubbles: true,
      composed: true,
    })
  )
  await Bun.sleep(10)
  expect(called, "Реакция не должна быть вызвана, если filter false").toBe(false)
})
