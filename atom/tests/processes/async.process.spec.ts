import "../../../dsl/meta/metafor.ts"
import { test, describe, expect } from "bun:test"
import { messagesFixture } from "../../../infra/test/fixture/message.ts"
describe.skip("async process", async () => {
  const hex = MetaFor("websocket")
    .fields((field) => ({
      timeStampConnecting: field.number.optional({ label: "Время начала подключения" }),
      timeStampConnected: field.number.optional({ label: "Время подключения" }),
      timeStampDisconnected: field.number.optional({ label: "Время отключения" }),
      maxAttempts: field.number.required(5, { label: "Максимальное количество попыток переподключения" }),
      remainingAttempts: field.number.required(0, { label: "Оставшиеся попытки переподключения" }),
      reconnectDelay: field.number.required(1000, { label: "Базовая задержка переподключения" }),
      reconnectDelayMultiplier: field.number.required(1.5, { label: "Множитель задержки переподключения" }),
      error: field.string.optional({ label: "Ошибка соединения" }),
    }))
    .superposition({
      отключен: {
        подключение: { remainingAttempts: { gt: 0 } },
      },
      подключение: {
        подключен: { remainingAttempts: { gt: 0 } },
        ошибка: { error: { null: false } },
      },
      подключен: {
        ошибка: { error: { null: false } },
      },
      ошибка: {
        ожидание: { remainingAttempts: { gt: 0 } },
        отключен: { remainingAttempts: { eq: 0 } },
      },
      ожидание: {
        подключение: { timeStampConnecting: { null: false } },
      },
    })
    .mass()
    .processes((process) => ({
      отключен: process({ label: "Подключение к WebSocket" })
        .action(({ fields }) => {
          if (!fields.remainingAttempts) return { remainingAttempts: fields.maxAttempts }
        })
        .success(({ update, data }) => update({ error: null, ...data }))
        .error(({ update, error }) => update({ error: error.message })),
      подключение: process({ label: "Установка соединения WebSocket" })
        .action(
          ({ fields }) =>
            new Promise<{ timeStampConnected: number }>((resolve) => {
              setTimeout(() => resolve({ timeStampConnected: new Date().getTime() }), 400)
            })
        )
        .success(({ update, data }) => update({ timeStampConnected: data.timeStampConnected }))
        .error(({ update, error }) => update({ error: error.message })),

      подключен: process({ label: "Мониторинг WebSocket соединения" })
        .action(
          ({}) =>
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("WebSocket соединение закрыто")), 10000)
            })
        )
        .error(({ update, error }) => update({ error: error.message })),

      ожидание: process({ label: "Ожидание переподключения к WebSocket" })
        .action(
          ({ fields }) =>
            new Promise<{ timeStampConnecting: number; remainingAttempts: number }>((resolve) => {
              fields.remainingAttempts = fields.remainingAttempts - 1
              const delay =
                fields.reconnectDelay *
                Math.pow(fields.reconnectDelayMultiplier, fields.maxAttempts - fields.remainingAttempts)
              setTimeout(() => {
                resolve({ timeStampConnecting: new Date().getTime(), remainingAttempts: fields.remainingAttempts })
              }, delay)
            })
        )
        .success(({ update, data }) =>
          update({
            timeStampConnecting: data.timeStampConnecting,
            timeStampConnected: null,
            timeStampDisconnected: null,
            error: null,
            remainingAttempts: data.remainingAttempts,
          })
        ),
    }))
    .reactions(() => [])
    .bulk({
      gravity: ({ html }) => html` <div class="websocket-status"></div> `,
    })
  const { waitForMessages } = messagesFixture({ meta: hex.name })
  const message = await waitForMessages(600)

  test("сообщение добавления мета", () => {
    expect(message[0]?.impulses[0]?.op).toBe("add")
  })
  test("вход в состояние отключен", () => {
    expect(message[1]?.impulses[0]).toEqual({
      op: "test",
      path: "/state",
      value: "отключен",
    })
  })
  test("изменение контекста в состоянии отключен", () => {
    expect(message[2]?.impulses[0]).toEqual({
      op: "replace",
      path: "/fields",
      value: {
        remainingAttempts: 5,
      },
    })
  })
  test("подтверждение входа в состояние отключен", () => {
    expect(message[3]?.impulses[0]).toEqual({
      op: "replace",
      path: "/state",
      value: "отключен",
    })
  })
  test("вход в состоянии подключение", () => {
    expect(message[4]?.impulses[0]).toEqual({
      op: "test",
      path: "/state",
      value: "подключение",
    })
  })
  test("изменение контекста в состоянии подключение", () => {
    expect(message[5]?.impulses[0]).toEqual({
      op: "replace",
      path: "/fields",
      value: {
        timeStampConnected: expect.any(Number),
      },
    })
  })
  test("подтверждение входа в состоянии подключение", () => {
    expect(message[6]?.impulses[0]).toEqual({
      op: "replace",
      path: "/state",
      value: "подключение",
    })
  })
  test("вход в состоянии подключен", () => {
    expect(message[7]?.impulses[0]).toEqual({
      op: "test",
      path: "/state",
      value: "подключен",
    })
  })
})
