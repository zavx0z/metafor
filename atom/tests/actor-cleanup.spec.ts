import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test"
import { Atom } from "../atom"
import { Fields } from "../src/fields"
import type { Meta } from "../../meta/metafor"

describe("Очистка ресурсов атома", () => {
  beforeEach(() => {
    // Очищаем глобальное состояние Fields
    Fields.set(new Fields())
    // Очищаем WeakMap с mass (создаем новый экземпляр)
    // Это невозможно сделать напрямую, но каждый тест создает новые атомы
  })

  afterEach(() => {
    // Очищаем глобальное состояние Fields
    Fields.set(new Fields())
  })

  const testSchema: Meta = {
    name: "test-atom",
    fields: {
      value: { type: "number", default: 0 },
    },
    superposition: {
      initial: {},
    },
    reactions: {
      reactions: {},
      superposition: {},
    },
    mass: {},
  }

  it("должен очищать mass из WeakMap при уничтожении", () => {
    const customMass = { customData: "test" }
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1", mass: customMass })

    // Проверяем, что mass доступен
    expect(atom.mass).toEqual(customMass)

    // Уничтожаем атом
    atom.destroy()

    // Проверяем, что mass больше не доступен
    // (WeakMap.delete() удаляет запись, но get() может вернуть undefined)
    expect(atom.mass).toBeUndefined()
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

  it("должен удалять только сам атом, дети остаются", () => {
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

    // Проверяем, что родитель удален, но дети остались (они продвигаются на место родителя)
    expect(hierarchy.has(parent.id)).toBe(false)
    expect(hierarchy.has(child1.id)).toBe(true)
    expect(hierarchy.has(child2.id)).toBe(true)
    expect(hierarchy.has(grandchild.id)).toBe(true)

    // Очистка
    child1.destroy()
    child2.destroy()
    grandchild.destroy()
  })

  it("должен корректно обрабатывать повторные вызовы destroy", () => {
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
    // Проверяем, что атом зарегистрирован
    expect(Fields.get().has(atom.id)).toBe(true)
    // Первый вызов destroy
    atom.destroy()
    expect(Fields.get().has(atom.id)).toBe(false)
    // Второй вызов destroy не должен вызывать ошибок
    expect(() => atom.destroy()).not.toThrow()
  })

  it("должен отправлять сообщение об удалении при destroy", async () => {
    const atom = Atom.fromSchema({ meta: testSchema, id: "atom-1" })

    // Убеждаемся, что EM не заблокирован
    const { EM } = await import("../em")
    const { Field } = await import("../field")
    
    // @ts-ignore
    const propagationSpy = jest.spyOn(Field, "propagation")
    // @ts-ignore
    const postMessageSpy = jest.spyOn(EM.channel || {}, "postMessage")

    const wasLocked = EM.isLocked
    if (wasLocked) EM.resume()

    try {
      // Уничтожаем атом
      atom.destroy()

      // Если EM был разблокирован, должны вызываться Field.propagation и postMessage
      if (!wasLocked) {
        // Проверяем, что propagation был вызван с правильным сообщением
        expect(propagationSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            meta: "test-atom",
            atom: "atom-1",
            path: expect.any(String),
            timestamp: expect.any(Number),
            impulses: [{ op: "remove", path: "/" }],
          })
        )
      }
    } finally {
      propagationSpy.mockRestore()
      if (postMessageSpy.mockRestore) postMessageSpy.mockRestore()
      if (wasLocked) EM.break()
    }
  })

  it("должен удалять только сам атом, не затрагивая соседние ветки", () => {
    // Создаем структуру: parent -> [child1, child2] -> [grandchild1, grandchild2]
    const parent = Atom.fromSchema({ meta: testSchema, id: "parent2" })
    const child1 = Atom.fromSchema({ meta: testSchema, id: "child1-2", path: `${parent.path}/0` })
    const child2 = Atom.fromSchema({ meta: testSchema, id: "child2-2", path: `${parent.path}/1` })
    const grandchild1 = Atom.fromSchema({ meta: testSchema, id: "grandchild1-2", path: `${child1.path}/0` })
    const grandchild2 = Atom.fromSchema({ meta: testSchema, id: "grandchild2-2", path: `${child2.path}/0` })

    const fields = Fields.get()

    // атомы автоматически регистрируются при создании

    // Сохраняем ссылки на mass для проверки
    const child1Mass = child1.mass
    const child2Mass = child2.mass
    const grandchild1Mass = grandchild1.mass
    const grandchild2Mass = grandchild2.mass

    // Проверяем, что все атомы зарегистрированы
    expect(fields.has(parent.id)).toBe(true)
    expect(fields.has(child1.id)).toBe(true)
    expect(fields.has(child2.id)).toBe(true)
    expect(fields.has(grandchild1.id)).toBe(true)
    expect(fields.has(grandchild2.id)).toBe(true)

    // Уничтожаем только child1 (удаляется только child1, grandchild1 остается)
    child1.destroy()

    // Проверяем, что child1 удален, но grandchild1 остается (он продвигается)
    expect(fields.has(child1.id)).toBe(false)
    expect(fields.has(grandchild1.id)).toBe(true)

    // Проверяем, что child2 и его потомок НЕ затронуты
    expect(fields.has(child2.id)).toBe(true)
    expect(fields.has(grandchild2.id)).toBe(true)
    expect(fields.has(parent.id)).toBe(true)

    // Проверяем, что mass у child2 и grandchild2 НЕ удален
    expect(child2.mass).toBe(child2Mass)
    expect(grandchild2.mass).toBe(grandchild2Mass)
    expect(child2.mass).toBeDefined()
    expect(grandchild2.mass).toBeDefined()

    // Проверяем, что mass у grandchild1 НЕ удален (он остался)
    expect(grandchild1.mass).toBe(grandchild1Mass)
    expect(grandchild1.mass).toBeDefined()

    // child1 уничтожен, его mass удален
    expect(child1.mass).toBeUndefined()

    // Очистка
    grandchild1.destroy()
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

    // Сохраняем ссылки на mass
    const branch1Mass = branch1.mass
    const branch2Mass = branch2.mass
    const leaf1Mass = leaf1.mass
    const leaf2Mass = leaf2.mass
    const leaf3Mass = leaf3.mass
    const deep1Mass = deep1.mass
    const deep2Mass = deep2.mass

    // Уничтожаем только branch1 (удаляется только branch1, его дети остаются и продвигаются)
    branch1.destroy()

    // Проверяем, что branch1 удален, но его дети остались
    expect(fields.has(branch1.id)).toBe(false)
    expect(fields.has(leaf1.id)).toBe(true)
    expect(fields.has(leaf2.id)).toBe(true)
    expect(fields.has(deep1.id)).toBe(true)
    expect(fields.has(deep2.id)).toBe(true)

    // Проверяем, что branch2 и leaf3 НЕ затронуты
    expect(fields.has(branch2.id)).toBe(true)
    expect(fields.has(leaf3.id)).toBe(true)
    expect(fields.has(root.id)).toBe(true)

    // Проверяем, что mass у незатронутых атомов НЕ удален
    expect(branch2.mass).toBe(branch2Mass)
    expect(leaf3.mass).toBe(leaf3Mass)
    expect(branch2.mass).toBeDefined()
    expect(leaf3.mass).toBeDefined()

    // Проверяем, что mass у оставшихся детей branch1 НЕ удален
    expect(leaf1.mass).toBe(leaf1Mass)
    expect(leaf2.mass).toBe(leaf2Mass)
    expect(deep1.mass).toBe(deep1Mass)
    expect(deep2.mass).toBe(deep2Mass)

    // branch1 уничтожен, его mass удален
    expect(branch1.mass).toBeUndefined()

    // Очистка
    leaf1.destroy()
    leaf2.destroy()
    branch2.destroy()
    root.destroy()
  })

  it("должен корректно очищать WeakMap только для уничтоженных атомов", () => {
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom2" })
    const atom3 = Atom.fromSchema({ meta: testSchema, id: "atom3" })

    // Сохраняем ссылки на mass
    const mass1 = atom1.mass
    const mass2 = atom2.mass
    const mass3 = atom3.mass

    // Проверяем, что все mass доступны
    expect(atom1.mass).toBe(mass1)
    expect(atom2.mass).toBe(mass2)
    expect(atom3.mass).toBe(mass3)

    // Уничтожаем только atom2
    atom2.destroy()

    // Проверяем, что mass у atom2 удален, но у atom1 и atom3 - нет
    expect(atom1.mass).toBe(mass1)
    expect(atom2.mass).toBeUndefined()
    expect(atom3.mass).toBe(mass3)

    // Уничтожаем atom1
    atom1.destroy()

    // Проверяем, что mass у atom1 удален, но у atom3 - нет
    expect(atom1.mass).toBeUndefined()
    expect(atom3.mass).toBe(mass3)

    // Очистка
    atom3.destroy()
  })

  it("должен корректно работать с WeakMap как статическим хранилищем", () => {
    // Создаем атомы
    const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom1" })
    const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom2" })

    // Проверяем, что mass доступны
    expect(atom1.mass).toBeDefined()
    expect(atom2.mass).toBeDefined()

    // Сохраняем ссылки
    const mass1 = atom1.mass
    const mass2 = atom2.mass

    // Уничтожаем atom1
    atom1.destroy()

    // Проверяем, что mass у atom1 удален, но у atom2 - нет
    expect(atom1.mass).toBeUndefined()
    expect(atom2.mass).toBe(mass2)

    // Создаем новый атом - он должен получить новый mass
    const atom3 = Atom.fromSchema({ meta: testSchema, id: "atom3" })
    expect(atom3.mass).toBeDefined()
    expect(atom3.mass).not.toBe(mass1) // Не должен быть тем же mass, что у atom1
    expect(atom3.mass).not.toBe(mass2) // И не тем же mass, что у atom2

    // Очистка
    atom2.destroy()
    atom3.destroy()
  })

  it("должен воспроизвести проблему с удалением mass у соседних атомов", () => {
    // Создаем структуру: 0 -> [0/0, 0/1] -> [0/0/0, 0/1/0]
    const root = Atom.fromSchema({ meta: testSchema, id: "root", path: "0" })
    const child0 = Atom.fromSchema({ meta: testSchema, id: "child0", path: "0/0" })
    const child1 = Atom.fromSchema({ meta: testSchema, id: "child1", path: "0/1" })
    const grandchild0 = Atom.fromSchema({ meta: testSchema, id: "grandchild0", path: "0/0/0" })
    const grandchild1 = Atom.fromSchema({ meta: testSchema, id: "grandchild1", path: "0/1/0" })

    const fields = Fields.get()

    // атомы автоматически регистрируются при создании

    // Сохраняем ссылки на mass
    const rootMass = root.mass
    const child0Mass = child0.mass
    const child1Mass = child1.mass
    const grandchild0Mass = grandchild0.mass
    const grandchild1Mass = grandchild1.mass

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

    // grandchild0 остается, так как удаление не рекурсивное
    expect(fields.has(grandchild0.id)).toBe(true)

    // Проверяем, что mass у child1 и grandchild1 НЕ удален
    expect(child1.mass).toBe(child1Mass)
    expect(grandchild1.mass).toBe(grandchild1Mass)
    expect(child1.mass).toBeDefined()
    expect(grandchild1.mass).toBeDefined()

    // child0 уничтожен, его mass должен быть undefined
    expect(child0.mass).toBeUndefined()

    // grandchild0 остается, его mass не удален
    expect(grandchild0.mass).toBe(grandchild0Mass)
    expect(grandchild0.mass).toBeDefined()

    // Очистка
    grandchild0.destroy()

    // Очистка
    child1.destroy()
    root.destroy()
  })
})
