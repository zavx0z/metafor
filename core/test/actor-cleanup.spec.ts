import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Actor } from "../../actor"
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

  it("должен очищать связи с родителем и детьми при уничтожении", () => {
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor-2" })

    // Устанавливаем связи
    actor1.parent = actor2
    actor2.children = [actor1]

    // Проверяем, что связи установлены
    expect(actor1.parent).toBe(actor2)
    expect(actor2.children).toContain(actor1)

    // Уничтожаем первый актор
    actor1.destroy()

    // Проверяем, что связи очищены
    expect(actor1.parent).toBeNull()
    expect(actor1.children).toEqual([])
  })

  it("должен корректно обрабатывать повторные вызовы destroy", () => {
    const actor = Actor.fromSchema({ meta: testSchema, id: "actor-1" })

    // Первый вызов destroy
    actor.destroy()
    expect(actor.stateListeners.size).toBe(0)
    expect(actor.parent).toBeNull()
    expect(actor.children).toEqual([])

    // Второй вызов destroy не должен вызывать ошибок
    expect(() => actor.destroy()).not.toThrow()
  })
})
