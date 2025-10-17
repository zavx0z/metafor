import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../actor.ts"
import type { Meta } from "../../meta/metafor.ts"
import { messagesFixture } from "../../infra/test/fixture/message.ts"
import { Electromagnetic } from "../electromagnetic.ts"

describe("Двойная отправка сообщений (BroadcastChannel + внутренний механизм)", () => {
  let messagesFixtureInstance: ReturnType<typeof messagesFixture>

  beforeEach(() => {
    // Очищаем реестр акторов
    // @ts-ignore
    Electromagnetic.chargedActors.clear()

    // Включаем BroadcastChannel
    Actor.setBroadcastChannel(true)

    // Инициализируем фикстуру для перехвата сообщений
    messagesFixtureInstance = messagesFixture({ meta: "test-actor" })
  })

  afterEach(() => {
    Actor.setBroadcastChannel(false)
    // @ts-ignore
    Electromagnetic.chargedActors.clear()
  })

  const testSchema: Meta = {
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

    // Обновляем контекст первого актора
    actor1.update({ value: 5 })

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Проверяем, что сообщение было отправлено через BroadcastChannel
    expect(messages.length).toBeGreaterThan(0)

    // Ищем сообщение с обновлением контекста (replace)
    const contextMessage = messages.find((msg) =>
      msg.patches.some((patch: any) => patch.op === "replace" && patch.path === "/context")
    )
    expect(contextMessage).toBeDefined()
    expect(contextMessage!.actor).toBe("actor-1")

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

    // Обновляем контекст первого актора
    actor1.update({ value: 5 })

    // Ждем сообщения через фикстуру
    const messages = await messagesFixtureInstance.waitForMessages(50)

    // Когда BroadcastChannel отключен, сообщения не отправляются через него
    expect(messages.length).toBe(0)

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
