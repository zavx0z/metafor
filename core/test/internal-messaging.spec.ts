import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../../actor"
import type { MetaSchema } from "../../metafor"

describe("Внутренний механизм коммуникации между акторами", () => {
  beforeEach(() => {
    // Очищаем реестр перед каждым тестом
    Actor.setBroadcastChannel(true)
  })

  afterEach(() => {
    // Очищаем реестр после каждого теста
    Actor.setBroadcastChannel(false)
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
            // Простая реакция - устанавливаем значение в 1 (безопасно)
            console.log(\`Реакция сработала для актора \${actor}, текущее значение: \${context.value}\`)
            update({ value: 1 })
          }`,
        },
      },
      states: {
        initial: ["value-reaction"],
      },
    },
  }

  it("должен регистрировать акторы в реестре", () => {
    const actor1 = Actor.fromSchema(testSchema, "actor-1")
    const actor2 = Actor.fromSchema(testSchema, "actor-2")

    expect(Actor.getRegisteredActorsCount()).toBe(2)
    expect(Actor.isBroadcastChannelEnabled()).toBe(true)

    actor1.destroy()
    actor2.destroy()
  })

  it("должен отправлять сообщения через внутренний механизм", async () => {
    const actor1 = Actor.fromSchema(testSchema, "actor-1")
    const actor2 = Actor.fromSchema(testSchema, "actor-2")

    // Изначальные значения
    expect(actor1.ctx.context.value).toBe(0)
    expect(actor2.ctx.context.value).toBe(0)

    // Обновляем контекст первого актора
    actor1.update({ value: 5 })

    // Даем время на выполнение реакций
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Второй актор должен получить реакцию и установить значение в 1
    expect(actor2.ctx.context.value).toBe(1)

    actor1.destroy()
    actor2.destroy()
  })

  it("должен корректно удалять акторы из реестра", () => {
    const actor1 = Actor.fromSchema(testSchema, "actor-1")
    const actor2 = Actor.fromSchema(testSchema, "actor-2")

    expect(Actor.getRegisteredActorsCount()).toBe(2)

    actor1.destroy()
    expect(Actor.getRegisteredActorsCount()).toBe(1)

    actor2.destroy()
    expect(Actor.getRegisteredActorsCount()).toBe(0)
  })

  it("должен переключаться между внутренним механизмом и BroadcastChannel", () => {
    expect(Actor.isBroadcastChannelEnabled()).toBe(true)

    Actor.setBroadcastChannel(false)
    expect(Actor.isBroadcastChannelEnabled()).toBe(false)

    Actor.setBroadcastChannel(true)
    expect(Actor.isBroadcastChannelEnabled()).toBe(true)
  })

  it("не должен отправлять сообщения самому себе", () => {
    const actor = Actor.fromSchema(testSchema, "actor-1")
    const initialValue = actor.ctx.context.value

    // Обновляем контекст
    actor.update({ value: 10 })

    // Значение должно остаться тем же, так как реакция не должна сработать на себя
    expect(actor.ctx.context.value).toBe(10)

    actor.destroy()
  })
})
