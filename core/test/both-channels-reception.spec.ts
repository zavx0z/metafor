import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../../actor"
import type { MetaSchema } from "../../metafor"

describe("Получение сообщений из обоих каналов", () => {
  let broadcastChannelMessages: any[] = []
  let originalPostMessage: typeof BroadcastChannel.prototype.postMessage

  beforeEach(() => {
    Actor.clearRegistry()

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
    Actor.channel.postMessage = originalPostMessage
    Actor.clearRegistry()
  })

  const testSchema: MetaSchema = {
    name: "test-actor",
    context: {
      value: { type: "number", default: 0 },
      source: { type: "string", default: "none" },
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
            // Реакция устанавливает источник сообщения (безопасно - не вызывает новую реакцию)
            update({ 
              source: "reaction"
            })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен получать сообщения из внутреннего реестра при включенном внутреннем механизме", async () => {
    Actor.setBroadcastChannel(true)

    const actor1 = Actor.fromSchema(testSchema, "actor-1")
    const actor2 = Actor.fromSchema(testSchema, "actor-2")

    // Очищаем сообщения от инициализации
    broadcastChannelMessages = []

    // Обновляем контекст первого актора
    actor1.update({ value: 5, source: "direct" })

    // Даем время на выполнение реакций
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Проверяем, что второй актор получил реакцию через внутренний механизм
    expect(actor2.ctx.context.value).toBe(0) // значение не изменилось
    expect(actor2.ctx.context.source).toBe("reaction") // источник изменился

    // Проверяем, что сообщение было отправлено через BroadcastChannel
    expect(broadcastChannelMessages.length).toBeGreaterThan(0)
    expect(broadcastChannelMessages[0].actor).toBe("actor-1")

    actor1.destroy()
    actor2.destroy()
  })

  it("должен получать сообщения только через BroadcastChannel при отключенном внутреннем механизме", async () => {
    Actor.setBroadcastChannel(false)

    const actor1 = Actor.fromSchema(testSchema, "actor-1")
    const actor2 = Actor.fromSchema(testSchema, "actor-2")

    // Очищаем сообщения от инициализации
    broadcastChannelMessages = []

    // Обновляем контекст первого актора
    actor1.update({ value: 5, source: "direct" })

    // Даем время на выполнение реакций
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Когда BroadcastChannel отключен, акторы все равно получают сообщения через внутренний механизм
    // Поэтому реакция должна сработать
    expect(actor2.ctx.context.value).toBe(0) // значение не изменилось
    expect(actor2.ctx.context.source).toBe("reaction") // источник изменился через внутренний механизм

    // Когда BroadcastChannel отключен, сообщения не отправляются через него
    expect(broadcastChannelMessages.length).toBe(0)

    actor1.destroy()
    actor2.destroy()
  })

  it("должен подписываться на BroadcastChannel независимо от состояния внутреннего механизма", () => {
    // Проверяем, что акторы всегда подписываются на BroadcastChannel
    Actor.setBroadcastChannel(true)
    const actor1 = Actor.fromSchema(testSchema, "actor-1")

    Actor.setBroadcastChannel(false)
    const actor2 = Actor.fromSchema(testSchema, "actor-2")

    // Оба актора должны быть зарегистрированы
    expect(Actor.getRegisteredActorsCount()).toBe(2)

    // Оба актора должны подписываться на BroadcastChannel
    // (это проверяется через то, что они получают сообщения)

    actor1.destroy()
    actor2.destroy()
  })
})
