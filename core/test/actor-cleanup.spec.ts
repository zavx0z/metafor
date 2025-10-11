import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test"
import { Actor } from "../../actor"
import { ActorCommunication } from "../communication"
import type { Meta } from "../../metafor"

describe("Очистка ресурсов актора", () => {
  beforeEach(() => {
    Actor.clearRegistry()
  })

  afterEach(() => {
    Actor.clearRegistry()
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

  it("должен рекурсивно уничтожать всех детей", () => {
    const parent = Actor.fromSchema({ meta: testSchema, id: "parent" })
    const child1 = Actor.fromSchema({ meta: testSchema, id: "child1", path: `${parent.path}/0` })
    const child2 = Actor.fromSchema({ meta: testSchema, id: "child2", path: `${parent.path}/1` })
    const grandchild = Actor.fromSchema({ meta: testSchema, id: "grandchild", path: `${child1.path}/0` })

    const hierarchy = ActorCommunication.getHierarchy()

    // Добавляем в иерархию
    hierarchy.appendChild(parent.path, child1.path)
    hierarchy.appendChild(parent.path, child2.path)
    hierarchy.appendChild(child1.path, grandchild.path)

    // Проверяем, что все акторы зарегистрированы
    expect(hierarchy.hasActor(parent.path)).toBe(true)
    expect(hierarchy.hasActor(child1.path)).toBe(true)
    expect(hierarchy.hasActor(child2.path)).toBe(true)
    expect(hierarchy.hasActor(grandchild.path)).toBe(true)

    // Уничтожаем родителя
    parent.destroy()

    // Проверяем, что все дети тоже уничтожены
    expect(hierarchy.hasActor(parent.path)).toBe(false)
    expect(hierarchy.hasActor(child1.path)).toBe(false)
    expect(hierarchy.hasActor(child2.path)).toBe(false)
    expect(hierarchy.hasActor(grandchild.path)).toBe(false)
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

  it("должен отправлять сообщение об удалении при destroy", () => {
    const actor = Actor.fromSchema({ meta: testSchema, id: "actor-1" })
    
    // Мокаем sendMessage для проверки вызова
    const sendMessageSpy = jest.spyOn(actor, 'sendMessage')
    
    // Уничтожаем актор
    actor.destroy()
    
    // Проверяем, что sendMessage был вызван с правильным сообщением
    expect(sendMessageSpy).toHaveBeenCalledWith({
      meta: testSchema.name,
      actor: "actor-1",
      path: actor.path,
      timestamp: expect.any(Number),
      patches: [{ op: "remove", path: "/" }]
    })
    
    sendMessageSpy.mockRestore()
  })
})
