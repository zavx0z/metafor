import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test"
import { Atom } from "../atom"
import { Fields } from "../src/fields"
import type { Meta } from "../../meta/metafor"

describe("Очистка ресурсов атома", () => {
  beforeEach(() => {
    // Очищаем глобальное состояние Fields
    Fields.set(new Fields())
    // Очищаем WeakMap с core (создаем новый экземпляр)
    // Это невозможно сделать напрямую, но каждый тест создает новые атомы
  })

  afterEach(() => {
    // Очищаем глобальное состояние Fields
    Fields.set(new Fields())
  })

  const testSchema: Meta = {
    name: "test-atom",
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
    core: {},
  }

  it("должен очищать core из WeakMap при уничтожении", () => {
    const customCore = { customData: "test" }
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1", core: customCore })

    // Проверяем, что core доступен
    expect(atom.core).toEqual(customCore)

    // Уничтожаем атом
    atom.destroy()

    // Проверяем, что core больше не доступен
    // (WeakMap.delete() удаляет запись, но get() может вернуть undefined)
    expect(atom.core).toBeUndefined()
  })

  it("должен очищать слушатели состояний при уничтожении", () => {
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1" })

    // Добавляем слушатель состояния
    const listener = (state: string) => {
      // State changed listener
    }
    atom.onCollapsed(listener)

    // @ts-ignore Проверяем, что слушатель добавлен
    expect(atom.stateObservers.size).toBe(1)

    // Уничтожаем атом
    atom.destroy()

    //@ts-ignore Проверяем, что слушатели очищены
    expect(atom.stateObservers.size).toBe(0)
  })

  it("должен удалять атом из иерархии при уничтожении", () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

    // Проверяем, что атомы зарегистрированы в иерархии
    expect(Fields.get().has(atom1.id)).toBe(true)
    expect(Fields.get().has(atom2.id)).toBe(true)

    // Уничтожаем первый атом
    atom1.destroy()

    // Проверяем, что атом удален из иерархии
    expect(Fields.get().has(atom1.id)).toBe(false)
    expect(Fields.get().has(atom2.id)).toBe(true)

    // Очистка
    atom2.destroy()
  })

  it("должен рекурсивно уничтожать всех детей", () => {
    const parent = Atom.fromSchema({ meta: testSchema, id: "parent" })
    const child1 = Atom.fromSchema({ meta: testSchema, id: "child1", path: `${parent.path}/0` })
    const child2 = Atom.fromSchema({ meta: testSchema, id: "child2", path: `${parent.path}/1` })
    const grandchild = Atom.fromSchema({ meta: testSchema, id: "grandchild", path: `${child1.path}/0` })

    const hierarchy = Fields.get()

    // атомы автоматически регистрируются при создании
    // Проверяем, что все атомы зарегистрированы
    expect(hierarchy.has(parent.id)).toBe(true)
    expect(hierarchy.has(child1.id)).toBe(true)
    expect(hierarchy.has(child2.id)).toBe(true)
    expect(hierarchy.has(grandchild.id)).toBe(true)

    // Уничтожаем родителя
    parent.destroy()

    // Проверяем, что родитель и все дети удалены рекурсивно
    expect(hierarchy.has(parent.id)).toBe(false)
    expect(hierarchy.has(child1.id)).toBe(false)
    expect(hierarchy.has(child2.id)).toBe(false)
    expect(hierarchy.has(grandchild.id)).toBe(false)
  })

  it("должен корректно обрабатывать повторные вызовы destroy", () => {
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1" })

    // Проверяем, что атом зарегистрирован
    expect(Fields.get().has(atom.id)).toBe(true)

    // Первый вызов destroy
    atom.destroy()
    // @ts-ignore
    expect(atom.stateObservers.size).toBe(0)
    expect(Fields.get().has(atom.id)).toBe(false)

    // Второй вызов destroy не должен вызывать ошибок
    expect(() => atom.destroy()).not.toThrow()
  })

  it("должен отправлять сообщение об удалении при destroy", () => {
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1" })

    // @ts-ignore
    const emissionSpy = jest.spyOn(atom as any, "emission")

    // Уничтожаем атом
    atom.destroy()

    // Проверяем, что emission был вызван с правильным сообщением
    expect(emissionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: "test-atom",
        atom: "atom-1",
        path: expect.any(String),
        timestamp: expect.any(Number),
        patches: [{ op: "remove", path: "/" }],
      })
    )

    emissionSpy.mockRestore()
  })

  it("должен уничтожать только детей в поддереве, не затрагивая соседние ветки", () => {
    // Создаем структуру: parent -> [child1, child2] -> [grandchild1, grandchild2]
    const parent = Atom.fromSchema({ meta: testSchema, id: "parent2" })
    const child1 = Atom.fromSchema({ meta: testSchema, id: "child1-2", path: `${parent.path}/0` })
    const child2 = Atom.fromSchema({ meta: testSchema, id: "child2-2", path: `${parent.path}/1` })
    const grandchild1 = Atom.fromSchema({ meta: testSchema, id: "grandchild1-2", path: `${child1.path}/0` })
    const grandchild2 = Atom.fromSchema({ meta: testSchema, id: "grandchild2-2", path: `${child2.path}/0` })

    const fields = Fields.get()

    // атомы автоматически регистрируются при создании

    // Сохраняем ссылки на core для проверки
    const child1Core = child1.core
    const child2Core = child2.core
    const grandchild1Core = grandchild1.core
    const grandchild2Core = grandchild2.core

    // Проверяем, что все атомы зарегистрированы
    expect(fields.has(parent.id)).toBe(true)
    expect(fields.has(child1.id)).toBe(true)
    expect(fields.has(child2.id)).toBe(true)
    expect(fields.has(grandchild1.id)).toBe(true)
    expect(fields.has(grandchild2.id)).toBe(true)

    // Уничтожаем только child1 (должны удалиться child1 и grandchild1, но НЕ child2 и grandchild2)
    child1.destroy()

    // Проверяем, что child1 и его потомок удалены рекурсивно
    expect(fields.has(child1.id)).toBe(false)
    expect(fields.has(grandchild1.id)).toBe(false)

    // Проверяем, что child2 и его потомок НЕ затронуты
    expect(fields.has(child2.id)).toBe(true)
    expect(fields.has(grandchild2.id)).toBe(true)
    expect(fields.has(parent.id)).toBe(true)

    // Проверяем, что core у child2 и grandchild2 НЕ удален (это ключевая проверка!)
    expect(child2.core).toBe(child2Core)
    expect(grandchild2.core).toBe(grandchild2Core)
    expect(child2.core).toBeDefined()
    expect(grandchild2.core).toBeDefined()

    // child1 и grandchild1 уничтожены рекурсивно
    // Проверяем, что их core удален
    expect(child1.core).toBeUndefined()
    expect(grandchild1.core).toBeUndefined()

    // Очистка
    child2.destroy()
    parent.destroy()
  })

  it("должен корректно обрабатывать сложную иерархию с несколькими уровнями", () => {
    // Создаем сложную структуру:
    // root -> [branch1, branch2] -> [leaf1, leaf2] -> [deep1, deep2]
    const root = Atom.fromSchema({ meta: testSchema, id: "root3" })
    const branch1 = Atom.fromSchema({ meta: testSchema, id: "branch1-3", path: `${root.path}/0` })
    const branch2 = Atom.fromSchema({ meta: testSchema, id: "branch2-3", path: `${root.path}/1` })
    const leaf1 = Atom.fromSchema({ meta: testSchema, id: "leaf1-3", path: `${branch1.path}/0` })
    const leaf2 = Atom.fromSchema({ meta: testSchema, id: "leaf2-3", path: `${branch1.path}/1` })
    const leaf3 = Atom.fromSchema({ meta: testSchema, id: "leaf3-3", path: `${branch2.path}/0` })
    const deep1 = Atom.fromSchema({ meta: testSchema, id: "deep1-3", path: `${leaf1.path}/0` })
    const deep2 = Atom.fromSchema({ meta: testSchema, id: "deep2-3", path: `${leaf2.path}/0` })

    const fields = Fields.get()

    // атомы автоматически регистрируются при создании

    // Сохраняем ссылки на core
    const branch1Core = branch1.core
    const branch2Core = branch2.core
    const leaf1Core = leaf1.core
    const leaf2Core = leaf2.core
    const leaf3Core = leaf3.core
    const deep1Core = deep1.core
    const deep2Core = deep2.core

    // Уничтожаем только branch1 (должны удалиться branch1 и все его потомки)
    branch1.destroy()

    // Проверяем, что branch1 и все его потомки удалены рекурсивно
    expect(fields.has(branch1.id)).toBe(false)
    expect(fields.has(leaf1.id)).toBe(false)
    expect(fields.has(leaf2.id)).toBe(false)
    expect(fields.has(deep1.id)).toBe(false)
    expect(fields.has(deep2.id)).toBe(false)

    // Проверяем, что branch2 и leaf3 НЕ затронуты
    expect(fields.has(branch2.id)).toBe(true)
    expect(fields.has(leaf3.id)).toBe(true)
    expect(fields.has(root.id)).toBe(true)

    // Проверяем, что core у незатронутых атомов НЕ удален
    expect(branch2.core).toBe(branch2Core)
    expect(leaf3.core).toBe(leaf3Core)
    expect(branch2.core).toBeDefined()
    expect(leaf3.core).toBeDefined()

    // Остальные атомы уничтожены рекурсивно
    // Проверяем, что их core удален
    expect(leaf1.core).toBeUndefined()
    expect(leaf2.core).toBeUndefined()
    expect(deep1.core).toBeUndefined()
    expect(deep2.core).toBeUndefined()

    // Очистка
    branch2.destroy()
    root.destroy()
  })

  it("должен корректно очищать WeakMap только для уничтоженных атомов", () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom2" })
    const atom3 = Atom.fromSchema({ meta: testSchema, id: "atom3" })

    // Сохраняем ссылки на core
    const core1 = atom1.core
    const core2 = atom2.core
    const core3 = atom3.core

    // Проверяем, что все core доступны
    expect(atom1.core).toBe(core1)
    expect(atom2.core).toBe(core2)
    expect(atom3.core).toBe(core3)

    // Уничтожаем только atom2
    atom2.destroy()

    // Проверяем, что core у atom2 удален, но у atom1 и atom3 - нет
    expect(atom1.core).toBe(core1)
    expect(atom2.core).toBeUndefined()
    expect(atom3.core).toBe(core3)

    // Уничтожаем atom1
    atom1.destroy()

    // Проверяем, что core у atom1 удален, но у atom3 - нет
    expect(atom1.core).toBeUndefined()
    expect(atom3.core).toBe(core3)

    // Очистка
    atom3.destroy()
  })

  it("должен корректно работать с WeakMap как статическим хранилищем", () => {
    // Создаем атомы
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom2" })

    // Проверяем, что core доступны
    expect(atom1.core).toBeDefined()
    expect(atom2.core).toBeDefined()

    // Сохраняем ссылки
    const core1 = atom1.core
    const core2 = atom2.core

    // Уничтожаем atom1
    atom1.destroy()

    // Проверяем, что core у atom1 удален, но у atom2 - нет
    expect(atom1.core).toBeUndefined()
    expect(atom2.core).toBe(core2)

    // Создаем новый атом - он должен получить новый core
    const atom3 = Atom.fromSchema({ meta: testSchema, id: "atom3" })
    expect(atom3.core).toBeDefined()
    expect(atom3.core).not.toBe(core1) // Не должен быть тем же core, что у atom1
    expect(atom3.core).not.toBe(core2) // И не тем же core, что у atom2

    // Очистка
    atom2.destroy()
    atom3.destroy()
  })

  it("должен воспроизвести проблему с удалением core у соседних атомов", () => {
    // Создаем структуру: 0 -> [0/0, 0/1] -> [0/0/0, 0/1/0]
    const root = Atom.fromSchema({ meta: testSchema, id: "root", path: "0" })
    const child0 = Atom.fromSchema({ meta: testSchema, id: "child0", path: "0/0" })
    const child1 = Atom.fromSchema({ meta: testSchema, id: "child1", path: "0/1" })
    const grandchild0 = Atom.fromSchema({ meta: testSchema, id: "grandchild0", path: "0/0/0" })
    const grandchild1 = Atom.fromSchema({ meta: testSchema, id: "grandchild1", path: "0/1/0" })

    const fields = Fields.get()

    // атомы автоматически регистрируются при создании

    // Сохраняем ссылки на core
    const rootCore = root.core
    const child0Core = child0.core
    const child1Core = child1.core
    const grandchild0Core = grandchild0.core
    const grandchild1Core = grandchild1.core

    // До destroy child0

    // Уничтожаем child0 (0/0) - должны удалиться child0 и grandchild0, но НЕ child1 и grandchild1
    child0.destroy()

    // После destroy child0

    // Проверяем, что child0 удален
    expect(fields.has(child0.id)).toBe(false)

    // Проверяем, что child1 и grandchild1 НЕ затронуты
    expect(fields.has(child1.id)).toBe(true)
    expect(fields.has(grandchild1.id)).toBe(true)
    expect(fields.has(root.id)).toBe(true)

    // grandchild0 удален рекурсивно вместе с child0
    expect(fields.has(grandchild0.id)).toBe(false)

    // Проверяем, что core у child1 и grandchild1 НЕ удален
    expect(child1.core).toBe(child1Core)
    expect(grandchild1.core).toBe(grandchild1Core)
    expect(child1.core).toBeDefined()
    expect(grandchild1.core).toBeDefined()

    // child0 уничтожен, его core должен быть undefined
    expect(child0.core).toBeUndefined()

    // grandchild0 уничтожен рекурсивно вместе с child0
    // Проверяем, что его core удален
    expect(grandchild0.core).toBeUndefined()

    // Очистка
    child1.destroy()
    root.destroy()
  })
})
