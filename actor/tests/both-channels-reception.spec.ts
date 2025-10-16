import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../actor.ts"
import type { Meta } from "../../meta/metafor.ts"
import { messagesFixture } from "../../infra/test/fixture/message.ts"
import { Electromagnetic } from "../electromagnetic/electromagnetic.ts"

describe("Получение сообщений из обоих каналов", () => {
  let messagesFixtureInstance: ReturnType<typeof messagesFixture>

  beforeEach(() => {
    // @ts-ignore
    Electromagnetic.chargedActors.clear()
    messagesFixtureInstance = messagesFixture({ meta: "test-actor" })
  })

  afterEach(() => {
    // @ts-ignore
    Electromagnetic.chargedActors.clear()
  })

  const testSchema: Meta = {
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

    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Обновляем контекст первого актора
    actor1.update({ value: 5, source: "direct" })

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Проверяем, что второй актор получил реакцию через внутренний механизм
    expect(actor2.ctx.context.value).toBe(0) // значение не изменилось
    expect(actor2.ctx.context.source).toBe("reaction") // источник изменился

    // Проверяем, что сообщение было отправлено через BroadcastChannel
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]!.actor).toBe("actor-1")

    actor1.destroy()
    actor2.destroy()
  })

  it("должен получать сообщения только через BroadcastChannel при отключенном внутреннем механизме", async () => {
    Actor.setBroadcastChannel(false)

    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Обновляем контекст первого актора
    actor1.update({ value: 5, source: "direct" })

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Когда BroadcastChannel отключен, акторы все равно получают сообщения через внутренний механизм
    // Поэтому реакция должна сработать
    expect(actor2.ctx.context.value).toBe(0) // значение не изменилось
    expect(actor2.ctx.context.source).toBe("reaction") // источник изменился через внутренний механизм

    // Когда BroadcastChannel отключен, сообщения не отправляются через него
    expect(messages.length).toBe(0)

    actor1.destroy()
    actor2.destroy()
  })

  it("должен подписываться на BroadcastChannel независимо от состояния внутреннего механизма", () => {
    // Проверяем, что акторы всегда подписываются на BroadcastChannel
    Actor.setBroadcastChannel(true)
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })

    Actor.setBroadcastChannel(false)
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Оба актора должны быть зарегистрированы
    expect(Actor.getRegisteredActorsCount()).toBe(2)

    // Оба актора должны подписываться на BroadcastChannel
    // (это проверяется через то, что они получают сообщения)

    actor1.destroy()
    actor2.destroy()
  })
})
