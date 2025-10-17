import { describe, it, expect } from "bun:test"
import { applyPatchesAndSave, rollbackLast, setActorSnapshot, getActorSnapshot } from "./snapshot"
import { diffArrays, applyPatchesToArray } from "./array"
import type { Core } from "../gravity.t"
import type { Key } from "../field.t"

type Primitive = string | number

describe("система снимков без полных снимков", () => {
  it("должен применять патчи к корневым свойствам и откатывать", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { count: 1, tags: ["a", "b", "c"] },
    })

    const patches = [
      { op: "replace" as const, path: "/context/count", value: 2 },
      { op: "add" as const, path: "/context/tags/1", value: "x" },
      { op: "remove" as const, path: "/context/tags/3" },
    ]

    applyPatchesAndSave(instance, patches)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.count).toBe(2)
    expect(snap.context.tags).toEqual(["a", "x", "b"])

    // rollback
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.count).toBe(1)
    expect(snap2.context.tags).toEqual(["a", "b", "c"])
  })

  it("должен генерировать минимальные перемещения с diffArrays и откат работает", () => {
    const oldArr: Primitive[] = [1, 2, 3, 4, 5]
    const newArr: Primitive[] = [3, 5, 1, 2, 4]

    const patches = diffArrays(oldArr, newArr, "/context/arr")
    expect(patches.length).toBeGreaterThan(0)

    // apply patches to snapshot
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { arr: oldArr.slice() },
    })

    applyPatchesAndSave(instance, patches as any)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.arr).toEqual(newArr)

    // rollback
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.arr).toEqual(oldArr)
  })

  it("должен обрабатывать множественные группы патчей и множественные откаты", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { tags: ["x", "y"], n: 0 },
    })

    const p1 = [{ op: "add", path: "/context/tags/2", value: "z" }]
    const p2 = [{ op: "replace", path: "/context/n", value: 5 }]

    applyPatchesAndSave(instance, p1 as any)
    applyPatchesAndSave(instance, p2 as any)

    let snap = getActorSnapshot(instance)!
    expect(snap.context.tags).toEqual(["x", "y", "z"])
    expect(snap.context.n).toBe(5)

    // rollback last
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.n).toBe(0)
    expect(snap.context.tags).toEqual(["x", "y", "z"])

    // rollback first
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.tags).toEqual(["x", "y"])
    expect(snap.context.n).toBe(0)
  })

  it("должен поддерживать консистентность diffArrays + applyPatchesToArray", () => {
    const oldArr: Primitive[] = [10, 20, 30]
    const newArr: Primitive[] = [30, 10, 40]

    const patches = diffArrays(oldArr, newArr)
    const result = applyPatchesToArray(oldArr, patches)
    expect(result).toEqual(newArr)
  })

  it("должен обрабатывать сложные вложенные объекты и откат", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        user: { name: "John", age: 30, tags: ["dev", "js"] },
        settings: { theme: "dark", lang: "en" },
      },
    })

    const patches = [
      { op: "replace" as const, path: "/context/user/age", value: 31 },
      { op: "add" as const, path: "/context/user/tags/2", value: "react" },
      { op: "replace" as const, path: "/context/settings/theme", value: "light" },
      { op: "add" as const, path: "/context/settings/notifications", value: true },
    ]

    applyPatchesAndSave(instance, patches)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.user.age).toBe(31)
    expect(snap.context.user.tags).toEqual(["dev", "js", "react"])
    expect(snap.context.settings.theme).toBe("light")
    expect(snap.context.settings.notifications).toBe(true)

    // rollback
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.user.age).toBe(30)
    expect(snap2.context.user.tags).toEqual(["dev", "js"])
    expect(snap2.context.settings.theme).toBe("dark")
    expect(snap2.context.settings.notifications).toBeUndefined()
  })

  it("должен обрабатывать множественные последовательные группы патчей со сложным откатом", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        items: ["a", "b", "c"],
        count: 0,
        metadata: { version: 1 },
      },
    })

    // Первая группа патчей
    const p1 = [
      { op: "add", path: "/context/items/1", value: "x" },
      { op: "replace", path: "/context/count", value: 1 },
    ]
    applyPatchesAndSave(instance, p1 as any)

    // Вторая группа патчей
    const p2 = [
      { op: "remove", path: "/context/items/3" },
      { op: "replace", path: "/context/metadata/version", value: 2 },
    ]
    applyPatchesAndSave(instance, p2 as any)

    // Третья группа патчей
    const p3 = [
      { op: "add", path: "/context/items/2", value: "y" },
      { op: "add", path: "/context/metadata/author", value: "dev" },
    ]
    applyPatchesAndSave(instance, p3 as any)

    let snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["a", "x", "y", "b"])
    expect(snap.context.count).toBe(1)
    expect(snap.context.metadata.version).toBe(2)
    expect(snap.context.metadata.author).toBe("dev")

    // Откат третьей группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["a", "x", "b"])
    expect(snap.context.metadata.author).toBeUndefined()

    // Откат второй группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["a", "x", "b", "c"])
    expect(snap.context.metadata.version).toBe(1)

    // Откат первой группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["a", "b", "c"])
    expect(snap.context.count).toBe(0)
  })

  it("должен обрабатывать граничные случаи: пустые массивы и объекты", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        emptyArr: [],
        emptyObj: {},
        mixed: { arr: [], obj: {} },
      },
    })

    const patches = [
      { op: "add" as const, path: "/context/emptyArr/0", value: "first" },
      { op: "add" as const, path: "/context/emptyObj/key", value: "value" },
      { op: "add" as const, path: "/context/mixed/arr/0", value: 1 },
      { op: "add" as const, path: "/context/mixed/obj/nested", value: "nested" },
    ]

    applyPatchesAndSave(instance, patches)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.emptyArr).toEqual(["first"])
    expect(snap.context.emptyObj).toEqual({ key: "value" })
    expect(snap.context.mixed.arr).toEqual([1])
    expect(snap.context.mixed.obj).toEqual({ nested: "nested" })

    // rollback
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.emptyArr).toEqual([])
    expect(snap2.context.emptyObj).toEqual({})
    expect(snap2.context.mixed.arr).toEqual([])
    expect(snap2.context.mixed.obj).toEqual({})
  })

  it("должен обрабатывать операции перемещения с откатом", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        items: ["a", "b", "c", "d", "e"],
      },
    })

    // Применяем операции move по одной, чтобы избежать проблем с индексами
    const patch1 = { op: "move" as const, from: "/context/items/0", path: "/context/items/2" } // a -> позиция 2
    applyPatchesAndSave(instance, [patch1])
    let snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["b", "c", "a", "d", "e"])

    const patch2 = { op: "move" as const, from: "/context/items/3", path: "/context/items/0" } // d -> позиция 0
    applyPatchesAndSave(instance, [patch2])
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["d", "b", "c", "a", "e"])

    // rollback второй операции
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["b", "c", "a", "d", "e"])

    // rollback первой операции
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(["a", "b", "c", "d", "e"])
  })

  it("должен проходить стресс-тест: много операций на большом массиве", () => {
    const instance = {} as any
    const largeArray = Array.from({ length: 100 }, (_, i) => i)
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        data: largeArray.slice(),
      },
    })

    const patches = []
    // Добавляем элементы в разные позиции
    for (let i = 0; i < 10; i++) {
      patches.push({ op: "add" as const, path: `/context/data/${i * 10}`, value: `item-${i}` })
    }
    // Удаляем некоторые элементы
    for (let i = 0; i < 5; i++) {
      patches.push({ op: "remove" as const, path: `/context/data/${i * 20}` })
    }

    applyPatchesAndSave(instance, patches)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.data.length).toBe(105) // 100 + 10 - 5

    // rollback
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.data).toEqual(largeArray)
  })

  it("должен обрабатывать ошибочные случаи: неверные пути", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { data: [1, 2, 3] },
    })

    // Тестируем обработку неверных путей
    expect(() => {
      applyPatchesAndSave(instance, [{ op: "add", path: "", value: "test" }])
    }).toThrow()

    expect(() => {
      applyPatchesAndSave(instance, [{ op: "add", path: "/", value: "test" }])
    }).toThrow()
  })

  it("должен обрабатывать откат когда истории не существует", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { data: "test" },
    })

    expect(rollbackLast(instance)).toBe(false)
  })

  it("должен обрабатывать множественные откаты до пустой истории", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { count: 0 },
    })

    // Применяем несколько групп патчей
    applyPatchesAndSave(instance, [{ op: "replace", path: "/context/count", value: 1 }])
    applyPatchesAndSave(instance, [{ op: "replace", path: "/context/count", value: 2 }])
    applyPatchesAndSave(instance, [{ op: "replace", path: "/context/count", value: 3 }])

    // Откатываем все
    expect(rollbackLast(instance)).toBe(true)
    expect(getActorSnapshot(instance)!.context.count).toBe(2)

    expect(rollbackLast(instance)).toBe(true)
    expect(getActorSnapshot(instance)!.context.count).toBe(1)

    expect(rollbackLast(instance)).toBe(true)
    expect(getActorSnapshot(instance)!.context.count).toBe(0)

    // Попытка отката когда история пуста
    expect(rollbackLast(instance)).toBe(false)
  })

  it("должен симулировать конкурентные изменения", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        shared: { value: 0, items: ["a"] },
        local: { flag: false },
      },
    })

    // Симулируем конкурентные изменения
    const patches1 = [
      { op: "replace" as const, path: "/context/shared/value", value: 1 },
      { op: "add" as const, path: "/context/shared/items/1", value: "b" },
    ]

    const patches2 = [
      { op: "replace" as const, path: "/context/local/flag", value: true },
      { op: "add" as const, path: "/context/local/priority", value: "high" },
    ]

    applyPatchesAndSave(instance, patches1)
    applyPatchesAndSave(instance, patches2)

    let snap = getActorSnapshot(instance)!
    expect(snap.context.shared.value).toBe(1)
    expect(snap.context.shared.items).toEqual(["a", "b"])
    expect(snap.context.local.flag).toBe(true)
    expect(snap.context.local.priority).toBe("high")

    // Откат последней группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.shared.value).toBe(1)
    expect(snap.context.shared.items).toEqual(["a", "b"])
    expect(snap.context.local.flag).toBe(false)
    expect(snap.context.local.priority).toBeUndefined()

    // Откат первой группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.shared.value).toBe(0)
    expect(snap.context.shared.items).toEqual(["a"])
    expect(snap.context.local.flag).toBe(false)
  })
})

describe("интеграция снимков с diffArrays", () => {
  it("должен интегрировать diffArrays с откатом снимков", () => {
    const instance = {} as any
    const originalArray = [1, 2, 3, 4, 5]
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { items: originalArray.slice() },
    })

    // Создаем новую версию массива
    const newArray = [3, 5, 1, 2, 4]
    const patches = diffArrays(originalArray, newArray, "/context/items")

    // Применяем патчи через snapshot систему
    applyPatchesAndSave(instance, patches as any)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(newArray)

    // Откат
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.items).toEqual(originalArray)
  })

  it("должен обрабатывать сложные трансформации массивов с откатом", () => {
    const instance = {} as any
    const originalArray = ["a", "b", "c", "d", "e"]
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        items: originalArray.slice(),
        metadata: { count: originalArray.length },
      },
    })

    // Сложная трансформация (только с существующими элементами)
    const newArray = ["e", "a", "c", "d", "b"]
    const patches = diffArrays(originalArray, newArray, "/context/items")

    // Добавляем патч для обновления метаданных
    patches.push({ op: "replace", path: "/context/metadata/count", value: newArray.length } as any)

    applyPatchesAndSave(instance, patches as any)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(newArray)
    expect(snap.context.metadata.count).toBe(newArray.length)

    // Откат
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.items).toEqual(originalArray)
    expect(snap2.context.metadata.count).toBe(originalArray.length)
  })

  it("должен обрабатывать множественные операции с массивами с независимым откатом", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        arr1: [1, 2, 3],
        arr2: ["a", "b"],
        counter: 0,
      },
    })

    // Первая операция: трансформация arr1
    const patches1 = diffArrays([1, 2, 3], [3, 1, 2], "/context/arr1")
    applyPatchesAndSave(instance, patches1 as any)

    // Вторая операция: трансформация arr2
    const patches2 = diffArrays(["a", "b"], ["b", "a", "c"], "/context/arr2")
    patches2.push({ op: "replace", path: "/context/counter", value: 1 } as any)
    applyPatchesAndSave(instance, patches2 as any)

    let snap = getActorSnapshot(instance)!
    expect(snap.context.arr1).toEqual([3, 1, 2])
    expect(snap.context.arr2).toEqual(["b", "a", "c"])
    expect(snap.context.counter).toBe(1)

    // Откат второй операции
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.arr1).toEqual([3, 1, 2]) // arr1 не изменился
    expect(snap.context.arr2).toEqual(["a", "b"])
    expect(snap.context.counter).toBe(0)

    // Откат первой операции
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.arr1).toEqual([1, 2, 3])
    expect(snap.context.arr2).toEqual(["a", "b"])
    expect(snap.context.counter).toBe(0)
  })

  it("должен проходить тест производительности: большие массивы с множественными операциями", () => {
    const instance = {} as any
    const size = 1000
    const originalArray = Array.from({ length: size }, (_, i) => i)
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { data: originalArray.slice() },
    })

    // Создаем случайную перестановку
    const shuffled = [...originalArray].sort(() => Math.random() - 0.5)
    const patches = diffArrays(originalArray, shuffled, "/context/data")

    const startTime = performance.now()
    applyPatchesAndSave(instance, patches as any)
    const applyTime = performance.now() - startTime

    const snap = getActorSnapshot(instance)!
    expect(snap.context.data).toEqual(shuffled)

    // Откат
    const rollbackStartTime = performance.now()
    expect(rollbackLast(instance)).toBe(true)
    const rollbackTime = performance.now() - rollbackStartTime

    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.data).toEqual(originalArray)

    // Проверяем, что операции выполняются достаточно быстро
    expect(applyTime).toBeLessThan(100) // менее 100мс
    expect(rollbackTime).toBeLessThan(100) // менее 100мс
  })

  it("должен обрабатывать граничный случай: пустой в непустой массив", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { items: [] },
    })

    const newArray = [1, 2, 3]
    const patches = diffArrays([], newArray, "/context/items")
    applyPatchesAndSave(instance, patches as any)

    const snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(newArray)

    // Откат
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.items).toEqual([])
  })

  it("должен обрабатывать граничный случай: непустой в пустой массив", () => {
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { items: [1, 2, 3] },
    })

    const patches = diffArrays([1, 2, 3], [], "/context/items")
    applyPatchesAndSave(instance, patches as any)

    const snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual([])

    // Откат
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.items).toEqual([1, 2, 3])
  })

  it("должен поддерживать консистентность: diffArrays + applyPatchesToArray + снимок", () => {
    const originalArray = [10, 20, 30, 40, 50]
    const targetArray = [30, 10, 20, 40, 50] // Только перестановка существующих элементов

    // Тест 1: diffArrays + applyPatchesToArray
    const patches = diffArrays(originalArray, targetArray)
    const result1 = applyPatchesToArray(originalArray, patches)
    expect(result1).toEqual(targetArray)

    // Тест 2: diffArrays + snapshot system с правильными путями
    const instance = {} as any
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: { data: originalArray.slice() },
    })

    // Создаем патчи с правильными путями для snapshot системы
    const snapshotPatches = patches.map((patch) => ({
      ...patch,
      from: (patch as any).from ? `/context/data${(patch as any).from}` : undefined,
      path: `/context/data${patch.path}`,
    })) as any

    applyPatchesAndSave(instance, snapshotPatches as any)
    const snap = getActorSnapshot(instance)!
    expect(snap.context.data).toEqual(targetArray)

    // Откат и проверка
    expect(rollbackLast(instance)).toBe(true)
    const snap2 = getActorSnapshot(instance)!
    expect(snap2.context.data).toEqual(originalArray)
  })

  it("должен обрабатывать смешанные операции: diffArrays + ручные патчи", () => {
    const instance = {} as any
    const originalArray = [1, 2, 3, 4, 5]
    setActorSnapshot(instance, {
      path: "",
      state: "idle",
      context: {
        items: originalArray.slice(),
        count: originalArray.length,
      },
    })

    // Сначала применяем diffArrays для перестановки
    const reorderedArray = [3, 1, 2, 4, 5]
    const patches1 = diffArrays(originalArray, reorderedArray, "/context/items")
    applyPatchesAndSave(instance, patches1 as any)

    // Затем добавляем новые элементы вручную
    const patches2 = [
      { op: "add", path: "/context/items/5", value: 6 },
      { op: "add", path: "/context/items/6", value: 7 },
      { op: "replace", path: "/context/count", value: 7 },
    ]
    applyPatchesAndSave(instance, patches2 as any)

    let snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual([3, 1, 2, 4, 5, 6, 7])
    expect(snap.context.count).toBe(7)

    // Откат второй группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual([3, 1, 2, 4, 5])
    expect(snap.context.count).toBe(5)

    // Откат первой группы
    expect(rollbackLast(instance)).toBe(true)
    snap = getActorSnapshot(instance)!
    expect(snap.context.items).toEqual(originalArray)
    expect(snap.context.count).toBe(5)
  })

  describe("реальные патчи из системы", () => {
    it("должен обрабатывать патчи состояний и контекста как в реальной системе", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "",
        state: "ожидание",
        context: {},
      })

      // Симуляция реальных патчей из лога
      const patches1 = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context", value: { status: "s" } },
        { op: "replace" as const, path: "/state", value: "данные" },
      ]

      applyPatchesAndSave(instance, patches1)
      let snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("данные")
      expect(snap.context).toEqual({ status: "s" })

      const patches2 = [
        { op: "test" as const, path: "/state", value: "данные" },
        { op: "replace" as const, path: "/context", value: { status: "s" } },
        { op: "replace" as const, path: "/state", value: "сборка" },
      ]

      applyPatchesAndSave(instance, patches2)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("сборка")
      expect(snap.context).toEqual({ status: "s" })

      // Откат второй группы
      expect(rollbackLast(instance)).toBe(true)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("данные")
      expect(snap.context).toEqual({ status: "s" })

      // Откат первой группы
      expect(rollbackLast(instance)).toBe(true)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("ожидание")
      expect(snap.context).toEqual({})
    })

    it("должен обрабатывать сложные патчи с вложенными объектами", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "0/0",
        state: "ожидание",
        context: {
          nodes: [],
          meta: { id: "test-id", src: "/test.js" },
        },
      })

      // Патчи для изменения состояния и контекста
      const patches = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context", value: { status: "s" } },
        { op: "replace" as const, path: "/state", value: "идентификация" },
        { op: "test" as const, path: "/state", value: "идентификация" },
        { op: "replace" as const, path: "/state", value: "мета" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("мета")
      expect(snap.context).toEqual({ status: "s" })

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context).toEqual({
        nodes: [],
        meta: { id: "test-id", src: "/test.js" },
      })
    })

    it("должен обрабатывать патчи с объектами в контексте", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "0/0/0",
        state: "ожидание",
        context: {},
      })

      const contextObject = {
        tag: "meta-for",
        src: "/meta/webxr.js",
        id: "273c1c6d-5618-4a5c-a6c6-1bbc659da82f",
      }

      const patches = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context", value: { status: "s" } },
        { op: "replace" as const, path: "/state", value: "данные" },
        { op: "test" as const, path: "/state", value: "данные" },
        { op: "replace" as const, path: "/context", value: contextObject },
        { op: "replace" as const, path: "/state", value: "загрузка" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("загрузка")
      expect(snap.context).toEqual(contextObject)

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context).toEqual({})
    })

    it("должен обрабатывать множественные операции с одним актором", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "0/0/0/0/0",
        state: "ожидание",
        context: {},
      })

      // Первая группа патчей
      const patches1 = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context", value: { status: "s" } },
        { op: "replace" as const, path: "/state", value: "данные" },
      ]

      applyPatchesAndSave(instance, patches1)
      let snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("данные")

      // Вторая группа патчей
      const patches2 = [
        { op: "test" as const, path: "/state", value: "данные" },
        { op: "replace" as const, path: "/state", value: "дети" },
      ]

      applyPatchesAndSave(instance, patches2)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("дети")

      // Третья группа патчей
      const patches3 = [
        { op: "test" as const, path: "/state", value: "дети" },
        { op: "replace" as const, path: "/state", value: "ожидание" },
      ]

      applyPatchesAndSave(instance, patches3)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("ожидание")

      // Откатываем все группы
      expect(rollbackLast(instance)).toBe(true)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("дети")

      expect(rollbackLast(instance)).toBe(true)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("данные")

      expect(rollbackLast(instance)).toBe(true)
      snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("ожидание")
    })

    it("должен обрабатывать патчи с replace контекста на объект", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "0/0/0/0/0",
        state: "ожидание",
        context: { initial: true },
      })

      const newContext = {
        nodes: ["node1", "node2"],
        meta: { id: "test" },
      }

      const patches = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context", value: newContext },
        { op: "replace" as const, path: "/state", value: "готов" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("готов")
      expect(snap.context).toEqual(newContext)

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context).toEqual({ initial: true })
    })

    it("должен обрабатывать патчи с test операциями как replace", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "test/path",
        state: "начальное",
        context: { value: 42 },
      })

      // Патчи с test операциями (должны изменять значения как replace)
      const patches = [
        { op: "test" as const, path: "/state", value: "изменено" },
        { op: "test" as const, path: "/context/value", value: 100 },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("изменено")
      expect(snap.context.value).toBe(100)

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("начальное")
      expect(snap2.context.value).toBe(42)
    })

    it("должен обрабатывать test операции с массивами", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "test/path",
        state: "ожидание",
        context: { items: ["a", "b", "c"] },
      })

      const patches = [
        { op: "test" as const, path: "/state", value: "готов" },
        { op: "test" as const, path: "/context/items/1", value: "x" },
        { op: "test" as const, path: "/context/items/2", value: "y" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("готов")
      expect(snap.context.items).toEqual(["a", "x", "y"])

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context.items).toEqual(["a", "b", "c"])
    })

    it("должен обрабатывать test операции с объектами", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "test/path",
        state: "ожидание",
        context: {
          meta: { id: "old-id", src: "/old.js" },
          data: "initial",
        },
      })

      const newMeta = {
        tag: "meta-for",
        src: "/meta/test.js",
        id: "new-id-123",
      }

      const patches = [
        { op: "test" as const, path: "/state", value: "готов" },
        { op: "test" as const, path: "/context/meta", value: newMeta },
        { op: "test" as const, path: "/context/data", value: "updated" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("готов")
      expect(snap.context.meta).toEqual(newMeta)
      expect(snap.context.data).toBe("updated")

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context.meta).toEqual({ id: "old-id", src: "/old.js" })
      expect(snap2.context.data).toBe("initial")
    })

    it("должен обрабатывать корневой путь /", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "/",
        state: "ожидание",
        context: { data: "initial" },
      })

      // Патчи для корневого актора
      const patches = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context/data", value: "updated" },
        { op: "replace" as const, path: "/state", value: "готов" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("готов")
      expect(snap.context.data).toBe("updated")

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context.data).toBe("initial")
    })

    it("должен обрабатывать корневой путь / с вложенными объектами", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "/",
        state: "ожидание",
        context: {
          nodes: [],
          meta: { id: "root-id", src: "/root.js" },
        },
      })

      const newMeta = {
        tag: "meta-for",
        src: "/meta/root.js",
        id: "273c1c6d-5618-4a5c-a6c6-1bbc659da82f",
      }

      const patches = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "replace" as const, path: "/context/meta", value: newMeta },
        { op: "replace" as const, path: "/state", value: "загружен" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("загружен")
      expect(snap.context.meta).toEqual(newMeta)

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context.meta).toEqual({ id: "root-id", src: "/root.js" })
    })

    it("должен обрабатывать корневой путь / с массивами", () => {
      const instance = {} as any
      setActorSnapshot(instance, {
        path: "/",
        state: "ожидание",
        context: {
          items: ["a", "b", "c"],
        },
      })

      const patches = [
        { op: "test" as const, path: "/state", value: "ожидание" },
        { op: "add" as const, path: "/context/items/1", value: "x" },
        { op: "remove" as const, path: "/context/items/3" },
        { op: "replace" as const, path: "/state", value: "обновлен" },
      ]

      applyPatchesAndSave(instance, patches)
      const snap = getActorSnapshot(instance)!
      expect(snap.state).toBe("обновлен")
      expect(snap.context.items).toEqual(["a", "x", "b"])

      // Откат
      expect(rollbackLast(instance)).toBe(true)
      const snap2 = getActorSnapshot(instance)!
      expect(snap2.state).toBe("ожидание")
      expect(snap2.context.items).toEqual(["a", "b", "c"])
    })
  })
})
