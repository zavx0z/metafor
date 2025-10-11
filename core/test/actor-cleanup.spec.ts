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
    expect(ActorCommunication.getFields().hasActor(actor1.path)).toBe(true)
    expect(ActorCommunication.getFields().hasActor(actor2.path)).toBe(true)

    // Уничтожаем первый актор
    actor1.destroy()

    // Проверяем, что актор удален из иерархии
    expect(ActorCommunication.getFields().hasActor(actor1.path)).toBe(false)
    expect(ActorCommunication.getFields().hasActor(actor2.path)).toBe(true)

    // Очистка
    actor2.destroy()
  })

  it("должен рекурсивно уничтожать всех детей", () => {
    const parent = Actor.fromSchema({ meta: testSchema, id: "parent" })
    const child1 = Actor.fromSchema({ meta: testSchema, id: "child1", path: `${parent.path}/0` })
    const child2 = Actor.fromSchema({ meta: testSchema, id: "child2", path: `${parent.path}/1` })
    const grandchild = Actor.fromSchema({ meta: testSchema, id: "grandchild", path: `${child1.path}/0` })

    const hierarchy = ActorCommunication.getFields()

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
    expect(ActorCommunication.getFields().hasActor(actor.path)).toBe(true)

    // Первый вызов destroy
    actor.destroy()
    expect(actor.stateListeners.size).toBe(0)
    expect(ActorCommunication.getFields().hasActor(actor.path)).toBe(false)

    // Второй вызов destroy не должен вызывать ошибок
    expect(() => actor.destroy()).not.toThrow()
  })

  it("должен отправлять сообщение об удалении при destroy", () => {
    const actor = Actor.fromSchema({ meta: testSchema, id: "actor-1" })

    // Мокаем sendMessage для проверки вызова
    const sendMessageSpy = jest.spyOn(actor, "sendMessage")

    // Уничтожаем актор
    actor.destroy()

    // Проверяем, что sendMessage был вызван с правильным сообщением
    expect(sendMessageSpy).toHaveBeenCalledWith({
      meta: testSchema.name,
      actor: "actor-1",
      path: actor.path,
      timestamp: expect.any(Number),
      patches: [{ op: "remove", path: "/" }],
    })

    sendMessageSpy.mockRestore()
  })

  it("должен уничтожать только детей в поддереве, не затрагивая соседние ветки", () => {
    // Создаем структуру: parent -> [child1, child2] -> [grandchild1, grandchild2]
    const parent = Actor.fromSchema({ meta: testSchema, id: "parent" })
    const child1 = Actor.fromSchema({ meta: testSchema, id: "child1", path: `${parent.path}/0` })
    const child2 = Actor.fromSchema({ meta: testSchema, id: "child2", path: `${parent.path}/1` })
    const grandchild1 = Actor.fromSchema({ meta: testSchema, id: "grandchild1", path: `${child1.path}/0` })
    const grandchild2 = Actor.fromSchema({ meta: testSchema, id: "grandchild2", path: `${child2.path}/0` })

    const fields = ActorCommunication.getFields()

    // Добавляем в иерархию
    fields.appendChild(parent.path, child1.path)
    fields.appendChild(parent.path, child2.path)
    fields.appendChild(child1.path, grandchild1.path)
    fields.appendChild(child2.path, grandchild2.path)

    // Сохраняем ссылки на core для проверки
    const child1Core = child1.core
    const child2Core = child2.core
    const grandchild1Core = grandchild1.core
    const grandchild2Core = grandchild2.core

    // Проверяем, что все акторы зарегистрированы
    expect(fields.hasActor(parent.path)).toBe(true)
    expect(fields.hasActor(child1.path)).toBe(true)
    expect(fields.hasActor(child2.path)).toBe(true)
    expect(fields.hasActor(grandchild1.path)).toBe(true)
    expect(fields.hasActor(grandchild2.path)).toBe(true)

    // Уничтожаем только child1 (должны удалиться child1 и grandchild1, но НЕ child2 и grandchild2)
    child1.destroy()

    // Проверяем, что child1 и его потомок удалены
    expect(fields.hasActor(child1.path)).toBe(false)
    expect(fields.hasActor(grandchild1.path)).toBe(false)

    // Проверяем, что child2 и его потомок НЕ затронуты
    expect(fields.hasActor(child2.path)).toBe(true)
    expect(fields.hasActor(grandchild2.path)).toBe(true)
    expect(fields.hasActor(parent.path)).toBe(true)

    // Проверяем, что core у child2 и grandchild2 НЕ удален (это ключевая проверка!)
    expect(child2.core).toBe(child2Core)
    expect(grandchild2.core).toBe(grandchild2Core)
    expect(child2.core).toBeDefined()
    expect(grandchild2.core).toBeDefined()

    // Проверяем, что core у child1 и grandchild1 удален
    expect(child1.core).toBeUndefined()
    expect(grandchild1.core).toBeUndefined()

    // Очистка
    child2.destroy()
    parent.destroy()
  })

  it("должен корректно обрабатывать сложную иерархию с несколькими уровнями", () => {
    // Создаем сложную структуру:
    // root -> [branch1, branch2] -> [leaf1, leaf2] -> [deep1, deep2]
    const root = Actor.fromSchema({ meta: testSchema, id: "root" })
    const branch1 = Actor.fromSchema({ meta: testSchema, id: "branch1", path: `${root.path}/0` })
    const branch2 = Actor.fromSchema({ meta: testSchema, id: "branch2", path: `${root.path}/1` })
    const leaf1 = Actor.fromSchema({ meta: testSchema, id: "leaf1", path: `${branch1.path}/0` })
    const leaf2 = Actor.fromSchema({ meta: testSchema, id: "leaf2", path: `${branch1.path}/1` })
    const leaf3 = Actor.fromSchema({ meta: testSchema, id: "leaf3", path: `${branch2.path}/0` })
    const deep1 = Actor.fromSchema({ meta: testSchema, id: "deep1", path: `${leaf1.path}/0` })
    const deep2 = Actor.fromSchema({ meta: testSchema, id: "deep2", path: `${leaf2.path}/0` })

    const fields = ActorCommunication.getFields()

    // Добавляем в иерархию
    fields.appendChild(root.path, branch1.path)
    fields.appendChild(root.path, branch2.path)
    fields.appendChild(branch1.path, leaf1.path)
    fields.appendChild(branch1.path, leaf2.path)
    fields.appendChild(branch2.path, leaf3.path)
    fields.appendChild(leaf1.path, deep1.path)
    fields.appendChild(leaf2.path, deep2.path)

    // Сохраняем ссылки на core
    const branch1Core = branch1.core
    const branch2Core = branch2.core
    const leaf1Core = leaf1.core
    const leaf2Core = leaf2.core
    const leaf3Core = leaf3.core
    const deep1Core = deep1.core
    const deep2Core = deep2.core

    // Уничтожаем только branch1 (должны удалиться branch1, leaf1, leaf2, deep1, deep2)
    // НО НЕ branch2 и leaf3
    branch1.destroy()

    // Проверяем, что branch1 и все его потомки удалены
    expect(fields.hasActor(branch1.path)).toBe(false)
    expect(fields.hasActor(leaf1.path)).toBe(false)
    expect(fields.hasActor(leaf2.path)).toBe(false)
    expect(fields.hasActor(deep1.path)).toBe(false)
    expect(fields.hasActor(deep2.path)).toBe(false)

    // Проверяем, что branch2 и leaf3 НЕ затронуты
    expect(fields.hasActor(branch2.path)).toBe(true)
    expect(fields.hasActor(leaf3.path)).toBe(true)
    expect(fields.hasActor(root.path)).toBe(true)

    // Проверяем, что core у незатронутых акторов НЕ удален
    expect(branch2.core).toBe(branch2Core)
    expect(leaf3.core).toBe(leaf3Core)
    expect(branch2.core).toBeDefined()
    expect(leaf3.core).toBeDefined()

    // Проверяем, что core у удаленных акторов удален
    expect(leaf1.core).toBeUndefined()
    expect(leaf2.core).toBeUndefined()
    expect(deep1.core).toBeUndefined()
    expect(deep2.core).toBeUndefined()

    // Очистка
    branch2.destroy()
    root.destroy()
  })

  it("должен корректно очищать WeakMap только для уничтоженных акторов", () => {
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor2" })
    const actor3 = Actor.fromSchema({ meta: testSchema, id: "actor3" })

    // Сохраняем ссылки на core
    const core1 = actor1.core
    const core2 = actor2.core
    const core3 = actor3.core

    // Проверяем, что все core доступны
    expect(actor1.core).toBe(core1)
    expect(actor2.core).toBe(core2)
    expect(actor3.core).toBe(core3)

    // Уничтожаем только actor2
    actor2.destroy()

    // Проверяем, что core у actor2 удален, но у actor1 и actor3 - нет
    expect(actor1.core).toBe(core1)
    expect(actor2.core).toBeUndefined()
    expect(actor3.core).toBe(core3)

    // Уничтожаем actor1
    actor1.destroy()

    // Проверяем, что core у actor1 удален, но у actor3 - нет
    expect(actor1.core).toBeUndefined()
    expect(actor3.core).toBe(core3)

    // Очистка
    actor3.destroy()
  })

  it("должен корректно работать с WeakMap как статическим хранилищем", () => {
    // Создаем акторы
    const actor1 = Actor.fromSchema({ meta: testSchema, id: "actor1" })
    const actor2 = Actor.fromSchema({ meta: testSchema, id: "actor2" })

    // Проверяем, что core доступны
    expect(actor1.core).toBeDefined()
    expect(actor2.core).toBeDefined()

    // Сохраняем ссылки
    const core1 = actor1.core
    const core2 = actor2.core

    // Уничтожаем actor1
    actor1.destroy()

    // Проверяем, что core у actor1 удален, но у actor2 - нет
    expect(actor1.core).toBeUndefined()
    expect(actor2.core).toBe(core2)

    // Создаем новый актор - он должен получить новый core
    const actor3 = Actor.fromSchema({ meta: testSchema, id: "actor3" })
    expect(actor3.core).toBeDefined()
    expect(actor3.core).not.toBe(core1) // Не должен быть тем же core, что у actor1
    expect(actor3.core).not.toBe(core2) // И не тем же core, что у actor2

    // Очистка
    actor2.destroy()
    actor3.destroy()
  })

  it("должен воспроизвести проблему с удалением core у соседних акторов", () => {
    // Создаем структуру: 0 -> [0/0, 0/1] -> [0/0/0, 0/1/0]
    const root = Actor.fromSchema({ meta: testSchema, id: "root", path: "0" })
    const child0 = Actor.fromSchema({ meta: testSchema, id: "child0", path: "0/0" })
    const child1 = Actor.fromSchema({ meta: testSchema, id: "child1", path: "0/1" })
    const grandchild0 = Actor.fromSchema({ meta: testSchema, id: "grandchild0", path: "0/0/0" })
    const grandchild1 = Actor.fromSchema({ meta: testSchema, id: "grandchild1", path: "0/1/0" })

    const fields = ActorCommunication.getFields()

    // Добавляем в иерархию
    fields.appendChild(root.path, child0.path)
    fields.appendChild(root.path, child1.path)
    fields.appendChild(child0.path, grandchild0.path)
    fields.appendChild(child1.path, grandchild1.path)

    // Сохраняем ссылки на core
    const rootCore = root.core
    const child0Core = child0.core
    const child1Core = child1.core
    const grandchild0Core = grandchild0.core
    const grandchild1Core = grandchild1.core

    console.log("До destroy child0:")
    console.log("root.core:", root.core === rootCore)
    console.log("child0.core:", child0.core === child0Core)
    console.log("child1.core:", child1.core === child1Core)
    console.log("grandchild0.core:", grandchild0.core === grandchild0Core)
    console.log("grandchild1.core:", grandchild1.core === grandchild1Core)

    // Уничтожаем child0 (0/0) - должны удалиться child0 и grandchild0, но НЕ child1 и grandchild1
    child0.destroy()

    console.log("После destroy child0:")
    console.log("root.core:", root.core === rootCore)
    console.log("child0.core:", child0.core === child0Core)
    console.log("child1.core:", child1.core === child1Core)
    console.log("grandchild0.core:", grandchild0.core === grandchild0Core)
    console.log("grandchild1.core:", grandchild1.core === grandchild1Core)

    // Проверяем, что child0 и grandchild0 удалены
    expect(fields.hasActor(child0.path)).toBe(false)
    expect(fields.hasActor(grandchild0.path)).toBe(false)

    // Проверяем, что child1 и grandchild1 НЕ затронуты
    expect(fields.hasActor(child1.path)).toBe(true)
    expect(fields.hasActor(grandchild1.path)).toBe(true)
    expect(fields.hasActor(root.path)).toBe(true)

    // Проверяем, что core у child1 и grandchild1 НЕ удален
    expect(child1.core).toBe(child1Core)
    expect(grandchild1.core).toBe(grandchild1Core)
    expect(child1.core).toBeDefined()
    expect(grandchild1.core).toBeDefined()

    // Проверяем, что core у child0 и grandchild0 удален
    expect(child0.core).toBeUndefined()
    expect(grandchild0.core).toBeUndefined()

    // Очистка
    child1.destroy()
    root.destroy()
  })
})
