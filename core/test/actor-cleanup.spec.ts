import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../../actor"
import { ActorCommunication } from "../communication"
import type { MetaSchema } from "../../metafor"

describe("Очистка ресурсов актора", () => {
  beforeEach(() => {
    Actor.clearRegistry()
  })

  afterEach(() => {
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
      reactions: {},
      states: {},
    },
  }

  it("должен очищать core из WeakMap при уничтожении", () => {
    const customCore = { customData: "test" }
    const actor = Actor.fromSchema({ meta: testSchema, id: "actor-1", core: customCore })

    // Проверяем, что core доступен
    expect(actor.core).toEqual(customCore)

    // Уничтожаем актор
    actor.destroy()

    // Проверяем, что core больше не доступен
    // (WeakMap.delete() удаляет запись, но get() может вернуть undefined)
    expect(actor.core).toBeUndefined()
  })

  it("должен очищать слушатели состояний при уничтожении", () => {
    const actor = Actor.fromSchema({ meta: testSchema, id: "actor-1" })

    // Добавляем слушатель состояния
    const listener = (state: string) => console.log("State changed:", state)
    actor.onStateChange(listener)

    // Проверяем, что слушатель добавлен
    expect(actor.stateListeners.size).toBe(1)

    // Уничтожаем актор
    actor.destroy()

    // Проверяем, что слушатели очищены
    expect(actor.stateListeners.size).toBe(0)
  })

  it("должен удалять актор из иерархии при уничтожении", () => {
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Проверяем, что акторы зарегистрированы в иерархии
    expect(ActorCommunication.getHierarchy().hasActor(actor1.path)).toBe(true)
    expect(ActorCommunication.getHierarchy().hasActor(actor2.path)).toBe(true)

    // Уничтожаем первый актор
    actor1.destroy()

    // Проверяем, что актор удален из иерархии
    expect(ActorCommunication.getHierarchy().hasActor(actor1.path)).toBe(false)
    expect(ActorCommunication.getHierarchy().hasActor(actor2.path)).toBe(true)

    // Очистка
    actor2.destroy()
  })

  it("должен корректно обрабатывать повторные вызовы destroy", () => {
    const actor = Actor.fromSchema({ meta: testSchema, id: "actor-1" })

    // Проверяем, что актор зарегистрирован
    expect(ActorCommunication.getHierarchy().hasActor(actor.path)).toBe(true)

    // Первый вызов destroy
    actor.destroy()
    expect(actor.stateListeners.size).toBe(0)
    expect(ActorCommunication.getHierarchy().hasActor(actor.path)).toBe(false)

    // Второй вызов destroy не должен вызывать ошибок
    expect(() => actor.destroy()).not.toThrow()
  })
})
