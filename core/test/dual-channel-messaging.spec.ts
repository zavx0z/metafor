import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../../actor"
import type { MetaSchema } from "../../metafor"

describe("Двойная отправка сообщений (BroadcastChannel + внутренний механизм)", () => {
  let broadcastChannelMessages: any[] = []
  let originalPostMessage: typeof BroadcastChannel.prototype.postMessage

  beforeEach(() => {
    // Очищаем реестр акторов
    Actor.clearRegistry()

    // Включаем BroadcastChannel
    Actor.setBroadcastChannel(true)

    // Перехватываем сообщения BroadcastChannel для тестирования
    broadcastChannelMessages = []
    originalPostMessage = Actor.channel.postMessage
    Actor.channel.postMessage = function (message: any) {
      broadcastChannelMessages.push(message)
      // Вызываем оригинальный метод, чтобы сообщения действительно отправлялись
      return originalPostMessage.call(this, message)
    }
  })

  afterEach(() => {
    // Восстанавливаем оригинальный метод
    Actor.channel.postMessage = originalPostMessage
    Actor.setBroadcastChannel(false)

    // Очищаем реестр акторов
    Actor.clearRegistry()
  })

  const testSchema: MetaSchema = {
    name: "test-actor",
    context: {
      value: { type: "number", default: 0 },
    },
    states: {
      initial: {},
    },
    reactions: {
      reactions: {
        "value-reaction": {
          label: "Реакция на изменение значения",
          cond: '({ self }) => ({ op: "replace", path: "/context" })',
          src: `({ context, meta, actor, update }) => {
            // Простая реакция - устанавливаем значение в 100
            update({ value: 100 })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен отправлять сообщения в оба канала", async () => {
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Очищаем сообщения от инициализации
    broadcastChannelMessages = []

    // Обновляем контекст первого актора
    actor1.update({ value: 5 })

    // Даем время на выполнение реакций
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Проверяем, что сообщение было отправлено через BroadcastChannel
    expect(broadcastChannelMessages.length).toBeGreaterThan(0)
    expect(broadcastChannelMessages[0].actor).toBe("actor-1")
    expect(broadcastChannelMessages[0].patches[0].op).toBe("replace")
    expect(broadcastChannelMessages[0].patches[0].path).toBe("/context")

    // Проверяем, что второй актор получил реакцию через внутренний механизм
    expect(actor2.ctx.context.value).toBe(100)

    actor1.destroy()
    actor2.destroy()
  })

  it("должен работать только с BroadcastChannel при отключенном внутреннем механизме", async () => {
    // Отключаем внутренний механизм
    Actor.setBroadcastChannel(false)

    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Очищаем сообщения от инициализации
    broadcastChannelMessages = []

    // Обновляем контекст первого актора
    actor1.update({ value: 5 })

    // Даем время на выполнение реакций
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Когда BroadcastChannel отключен, сообщения не отправляются через него
    expect(broadcastChannelMessages.length).toBe(0)

    // Но акторы все равно получают сообщения через внутренний механизм
    // Поэтому реакция должна сработать
    expect(actor2.ctx.context.value).toBe(100)

    actor1.destroy()
    actor2.destroy()
  })

  it("должен регистрировать акторы в реестре независимо от состояния внутреннего механизма", () => {
    Actor.setBroadcastChannel(false)
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    expect(Actor.getRegisteredActorsCount()).toBe(1)

    Actor.setBroadcastChannel(true)
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })
    expect(Actor.getRegisteredActorsCount()).toBe(2)

    actor1.destroy()
    actor2.destroy()
  })
})
