import { test, describe, expect } from "bun:test"
import { MetaFor } from "../metafor.ts"
import { messagesFixture } from "../../fixture/message.ts"
describe("async process", async () => {
  const { waitForMessages } = messagesFixture({ meta: "websocket" })
  document.body.innerHTML = `<metafor-websocket></metafor-websocket>`
  MetaFor("websocket")
    .context((t) => ({
      timeStampConnecting: t.number.optional()({ title: "Время начала подключения" }),
      timeStampConnected: t.number.optional()({ title: "Время подключения" }),
      timeStampDisconnected: t.number.optional()({ title: "Время отключения" }),
      maxAttempts: t.number.required(5)({ title: "Максимальное количество попыток переподключения" }),
      remainingAttempts: t.number.required(0)({ title: "Оставшиеся попытки переподключения" }),
      reconnectDelay: t.number.required(1000)({ title: "Базовая задержка переподключения" }),
      reconnectDelayMultiplier: t.number.required(1.5)({ title: "Множитель задержки переподключения" }),
      error: t.string.optional()({ title: "Ошибка соединения" }),
    }))
    .states({
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
    .core()
    .processes((process) => ({
      отключен: process({ title: "Подключение к WebSocket" })
        .action(({ context }) => {
          if (!context.remainingAttempts) return { remainingAttempts: context.maxAttempts }
        })
        .success(({ update, data }) => update({ error: null, ...data }))
        .error(({ update, error }) => update({ error: error.message })),
      подключение: process({ title: "Установка соединения WebSocket" })
        .action(
          ({ context }) =>
            new Promise<{ timeStampConnected: number }>((resolve) => {
              setTimeout(() => resolve({ timeStampConnected: new Date().getTime() }), 400)
            })
        )
        .success(({ update, data }) => update({ timeStampConnected: data.timeStampConnected }))
        .error(({ update, error }) => update({ error: error.message })),

      подключен: process({ title: "Мониторинг WebSocket соединения" })
        .action(
          ({}) =>
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("WebSocket соединение закрыто")), 10000)
            })
        )
        .error(({ update, error }) => update({ error: error.message })),

      ожидание: process({ title: "Ожидание переподключения к WebSocket" })
        .action(
          ({ context }) =>
            new Promise<{ timeStampConnecting: number; remainingAttempts: number }>((resolve) => {
              context.remainingAttempts = context.remainingAttempts - 1
              const delay =
                context.reconnectDelay *
                Math.pow(context.reconnectDelayMultiplier, context.maxAttempts - context.remainingAttempts)
              setTimeout(() => {
                resolve({ timeStampConnecting: new Date().getTime(), remainingAttempts: context.remainingAttempts })
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
    .view({
      render: ({ html }) => html` <div class="websocket-status"></div> `,
    })
  const message = await waitForMessages(600)

  test("сообщение добавления мета", () => {
    expect(message[0]?.patch.op).toBe("add")
  })
  test("вход в состояние отключен", () => {
    expect(message[1]?.patch).toEqual({
      op: "test",
      path: "/state",
      value: "отключен",
    })
  })
  test("изменение контекста в состоянии отключен", () => {
    expect(message[2]?.patch).toEqual({
      op: "replace",
      path: "/context",
      value: {
        remainingAttempts: 5,
      },
    })
  })
  test("подтверждение входа в состояние отключен", () => {
    expect(message[3]?.patch).toEqual({
      op: "replace",
      path: "/state",
      value: "отключен",
    })
  })
  test("вход в состоянии подключение", () => {
    expect(message[4]?.patch).toEqual({
      op: "test",
      path: "/state",
      value: "подключение",
    })
  })
  test("изменение контекста в состоянии подключение", () => {
    expect(message[5]?.patch).toEqual({
      op: "replace",
      path: "/context",
      value: {
        timeStampConnected: expect.any(Number),
      },
    })
  })
  test("подтверждение входа в состоянии подключение", () => {
    expect(message[6]?.patch).toEqual({
      op: "replace",
      path: "/state",
      value: "подключение",
    })
  })
  test("вход в состоянии подключен", () => {
    expect(message[7]?.patch).toEqual({
      op: "test",
      path: "/state",
      value: "подключен",
    })
  })
})
