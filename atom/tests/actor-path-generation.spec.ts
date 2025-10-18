import { test, expect, beforeEach, describe } from "bun:test"
import { Atom } from "../atom"
import { Fields } from "../src/fields"

describe("", () => {
  let fields: Fields

  beforeEach(() => {
    fields = Fields.get()
    Fields.set(new (Fields as any)())
    fields = Fields.get()
  })

  test("atom - автоматическая генерация корневых путей", () => {
    // Создаем атомы без явного указания path
    const atom1 = Atom.fromSchema({
      meta: {
        name: "atom-1",
        context: {},
        states: { idle: {} },
        processes: {},
        reactions: { reactions: {}, states: {} },
        core: {},
      },
      id: "test1",
    })

    const atom2 = Atom.fromSchema({
      meta: {
        name: "atom-2",
        context: {},
        states: { idle: {} },
        processes: {},
        reactions: { reactions: {}, states: {} },
        core: {},
      },
      id: "test2",
    })

    const atom3 = Atom.fromSchema({
      meta: {
        name: "atom-3",
        context: {},
        states: { idle: {} },
        processes: {},
        reactions: { reactions: {}, states: {} },
        core: {},
      },
      id: "test3",
    })

    // Проверяем пути
    expect(atom1.path).toBe("0")
    expect(atom2.path).toBe("1")
    expect(atom3.path).toBe("2")

    // Проверяем, что id остается оригинальным
    expect(atom1.id).toBe("test1")
    expect(atom2.id).toBe("test2")
    expect(atom3.id).toBe("test3")

    // Очистка
    atom1.destroy()
    atom2.destroy()
    atom3.destroy()
  })

  test("atom - явное указание path переопределяет автогенерацию", () => {
    const testSchema = {
      name: "test",
      context: {},
      states: { idle: {} },
      processes: {},
      reactions: { reactions: {}, states: {} },
      core: {},
    }

    // Создаем атом с явным path
    const atomWithPath = Atom.fromSchema({
      meta: testSchema,
      id: "test",
      path: "0", // явный путь
    })

    // Создаем атом без path (должен получить автогенерированный)
    const atomAutoPath = Atom.fromSchema({
      meta: testSchema,
      id: "test2",
    })

    // Проверяем пути
    expect(atomWithPath.path).toBe("0")
    expect(atomAutoPath.path).toBe("1") // следующий автогенерированный

    // Очистка
    atomWithPath.destroy()
    atomAutoPath.destroy()
  })

  test("atom - счетчик путей инкрементируется корректно", () => {
    const testSchema = {
      name: "test",
      context: {},
      states: { idle: {} },
      processes: {},
      reactions: { reactions: {}, states: {} },
      core: {},
    }

    const atoms: Atom[] = []

    // Создаем несколько атомов
    for (let i = 0; i < 5; i++) {
      const atom = Atom.fromSchema({
        meta: testSchema,
        id: `test${i}`,
      })
      atoms.push(atom)
    }

    // Проверяем последовательность путей
    expect(atoms[0]!.path).toBe("0")
    expect(atoms[1]!.path).toBe("1")
    expect(atoms[2]!.path).toBe("2")
    expect(atoms[3]!.path).toBe("3")
    expect(atoms[4]!.path).toBe("4")

    // Очистка
    atoms.forEach((atom) => atom.destroy())
  })

  test("atom.fromSchema - поддержка параметра path", () => {
    const testSchema = {
      name: "test",
      desc: "Test schema",
      context: {},
      states: { idle: {} },
      processes: {},
      reactions: { reactions: {}, states: {} },
      core: {},
      render: [],
    }

    // Создаем атом с явным path через fromSchema
    const atomWithPath = Atom.fromSchema({
      meta: testSchema,
      id: "atom-with-path",
      path: "0", // простой путь
    })

    // Создаем атом без path (должен получить автогенерированный)
    const atomAutoPath = Atom.fromSchema({
      meta: testSchema,
      id: "atom-auto-path",
    })

    // Проверяем пути
    expect(atomWithPath.path).toBe("0")
    expect(atomAutoPath.path).toBe("1") // следующий автогенерированный

    // Очистка
    atomWithPath.destroy()
    atomAutoPath.destroy()
  })
})
