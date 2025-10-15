import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../actor"
import type { Meta } from "../../schema/metafor"
import { Electromagnetic } from "../force/electromagnetic"

describe("Коммуникация между акторами в разных потоках/воркерах", () => {
  beforeEach(() => {
    // @ts-ignore
    // Electromagnetic.chargedActors.clear()
  })

  afterEach(() => {
    // @ts-ignore
    // Electromagnetic.chargedActors.clear()
  })

  const testSchema: Meta = {
    name: "worker-actor",
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
            // Реакция устанавливает значение в 999
            update({ value: 999 })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен использовать только BroadcastChannel при отключенном внутреннем механизме", () => {
    // Отключаем внутренний механизм - все акторы будут общаться через BroadcastChannel
    Actor.setBroadcastChannel(false)

    const actor1 = Actor.fromSchema({ meta: testSchema, id: "worker-actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "worker-actor-2" })

    // Проверяем, что акторы зарегистрированы, но внутренний механизм отключен
    expect(Actor.getRegisteredActorsCount()).toBe(2)
    expect(Actor.isBroadcastChannelEnabled()).toBe(false)

    // В этом случае акторы будут общаться только через BroadcastChannel
    // что подходит для случаев, когда они находятся в разных потоках/воркерах

    actor1.destroy()
    actor2.destroy()
  })

  it("должен использовать внутренний механизм для акторов в том же потоке", () => {
    // Включаем внутренний механизм - акторы в том же потоке будут общаться быстро
    Actor.setBroadcastChannel(true)

    const actor1 = Actor.fromSchema({ meta: testSchema, id: "main-actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "main-actor-2" })

    // Проверяем, что акторы зарегистрированы и внутренний механизм включен
    expect(Actor.getRegisteredActorsCount()).toBe(2)
    expect(Actor.isBroadcastChannelEnabled()).toBe(true)

    // В этом случае акторы будут общаться через внутренний реестр (быстро)
    // но сообщения также будут отправляться через BroadcastChannel для других потоков

    actor1.destroy()
    actor2.destroy()
  })

  it("должен правильно переключаться между режимами", () => {
    // Начинаем с отключенного внутреннего механизма
    Actor.setBroadcastChannel(false)
    expect(Actor.isBroadcastChannelEnabled()).toBe(false)

    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    expect(Actor.getRegisteredActorsCount()).toBe(1)

    // Включаем внутренний механизм
    Actor.setBroadcastChannel(true)
    expect(Actor.isBroadcastChannelEnabled()).toBe(true)

    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })
    expect(Actor.getRegisteredActorsCount()).toBe(2)

    // Отключаем внутренний механизм
    Actor.setBroadcastChannel(false)
    expect(Actor.isBroadcastChannelEnabled()).toBe(false)

    const actor3 = Actor.fromSchema({ meta: testSchema, id: "actor-3" })
    expect(Actor.getRegisteredActorsCount()).toBe(3)

    actor1.destroy()
    actor2.destroy()
    actor3.destroy()
  })
})
