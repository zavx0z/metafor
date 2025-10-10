import { test, expect } from "bun:test"
import { ActorHierarchy } from "./hierarchy"
import type { ActorCommunication } from "./communication"

// Мок для ActorCommunication
class MockActor {
  constructor(public id: string) {}
  hasReactions() {
    return false
  }
  handleReactionMessage() {}
}

test("ActorHierarchy - создание и базовые операции", () => {
  const hierarchy = new ActorHierarchy()
  const actor = new MockActor("test-actor") as unknown as ActorCommunication

  // Создание узла
  hierarchy.createNode("0", actor)
  expect(hierarchy.hasActor("0")).toBe(true)
  expect(hierarchy.getActor("0")).toBe(actor)
  expect(hierarchy.getActorCount()).toBe(1)
})

test("ActorHierarchy - работа с иерархией", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "child1", "child2"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!!)
  hierarchy.createNode("0/0", actors[1]!!)
  hierarchy.createNode("0/1", actors[2]!!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0", "0/1")

  // Проверяем иерархию
  const children = hierarchy.getChildren("0")
  expect(children).toEqual(["0/0", "0/1"])
  expect(hierarchy.getParentPath("0/0")).toBe("0")
  expect(hierarchy.isRootNode("0")).toBe(true)
  expect(hierarchy.isRootNode("0/0")).toBe(false)
})

test("ActorHierarchy - перемещение узлов", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "a", "b", "c"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/1", actors[2]!)
  hierarchy.createNode("0/2", actors[3]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0", "0/1")
  hierarchy.appendChild("0", "0/2")

  // Перемещаем
  hierarchy.moveBefore("0/0", "0/2")
  expect(hierarchy.getChildren("0")).toEqual(["0/2", "0/0", "0/1"])

  hierarchy.moveAfter("0/0", "0/2")
  expect(hierarchy.getChildren("0")).toEqual(["0/0", "0/2", "0/1"])
})

test("ActorHierarchy - вставка между узлами", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "a", "b", "x"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/1", actors[2]!)
  hierarchy.createNode("0/2", actors[3]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0", "0/1")

  // Вставляем между
  hierarchy.insertBetween("0/0", "0/1", "0/2")
  expect(hierarchy.getChildren("0")).toEqual(["0/0", "0/2", "0/1"])
})

test("ActorHierarchy - перепривязка узлов", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "a", "b", "child"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/1", actors[2]!)
  hierarchy.createNode("0/0/0", actors[3]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0", "0/1")

  // Перепривязываем child к a
  hierarchy.reparent("0/0", "0/0/0", { at: "end" })

  expect(hierarchy.getByIndexPath("0", [0])).toBe("0/0")
  expect(hierarchy.getByIndexPath("0", [0, 0])).toBe("0/0/0")
})

test("ActorHierarchy - удаление узлов", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "a", "b"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/1", actors[2]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0", "0/1")

  // Удаляем узел
  hierarchy.removeNode("0/0")
  expect(hierarchy.hasActor("0/0")).toBe(false)
  expect(hierarchy.getChildren("0")).toEqual(["0/1"])
})

test("ActorHierarchy - рекурсивное удаление", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "a", "a1", "a2"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/0/0", actors[2]!)
  hierarchy.createNode("0/0/1", actors[3]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0/0", "0/0/0")
  hierarchy.appendChild("0/0", "0/0/1")

  // Рекурсивно удаляем
  hierarchy.removeNode("0/0", true)
  expect(hierarchy.hasActor("0/0")).toBe(false)
  expect(hierarchy.hasActor("0/0/0")).toBe(false)
  expect(hierarchy.hasActor("0/0/1")).toBe(false)
  expect(hierarchy.getChildren("0")).toEqual([])
})

test("ActorHierarchy - корневые узлы", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root1", "root2"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем корневые узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("1", actors[1]!)

  // Добавляем как корневые
  hierarchy.appendChild(null, "0")
  hierarchy.appendChild(null, "1")

  const rootNodes = hierarchy.getRootNodes()
  expect(rootNodes).toEqual(["0", "1"])
  expect(hierarchy.isRootNode("0")).toBe(true)
  expect(hierarchy.isRootNode("1")).toBe(true)
})

test("ActorHierarchy - утилитарные методы", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "child", "grandchild"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/0/0", actors[2]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0/0", "0/0/0")

  // Тестируем утилитарные методы
  expect(hierarchy.getDepth("0")).toBe(1)
  expect(hierarchy.getDepth("0/0")).toBe(2)
  expect(hierarchy.getDepth("0/0/0")).toBe(3)

  expect(hierarchy.isAncestor("0", "0/0/0")).toBe(true)
  expect(hierarchy.isAncestor("0/0", "0/0/0")).toBe(true)
  expect(hierarchy.isAncestor("0/0/0", "0")).toBe(false)

  const descendants = hierarchy.getDescendants("0")
  expect(descendants).toEqual(["0/0", "0/0/0"])

  const pathToRoot = hierarchy.getPathToRoot("0/0/0")
  expect(pathToRoot).toEqual(["0", "0/0", "0/0/0"])
})

test("ActorHierarchy - нормализация и очистка", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "a", "b"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/1", actors[2]!)

  // Добавляем детей
  hierarchy.appendChild("0", "0/0")
  hierarchy.appendChild("0", "0/1")

  // Нормализуем
  hierarchy.normalizeChildren("0")

  // Очищаем
  expect(hierarchy.getActorCount()).toBe(3)
  hierarchy.clear()
  expect(hierarchy.getActorCount()).toBe(0)
})

test("ActorHierarchy - поиск по id", () => {
  const hierarchy = new ActorHierarchy()
  const actors = ["root", "child1", "child2"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  hierarchy.createNode("0", actors[0]!)
  hierarchy.createNode("0/0", actors[1]!)
  hierarchy.createNode("0/1", actors[2]!)

  // Тестируем поиск по id
  expect(hierarchy.getActorById("root")).toBe(actors[0]!)
  expect(hierarchy.getActorById("child1")).toBe(actors[1]!)
  expect(hierarchy.getActorById("child2")).toBe(actors[2]!)
  expect(hierarchy.getActorById("nonexistent")).toBe(null)

  // Тестируем получение пути по id
  expect(hierarchy.getPathById("root")).toBe("0")
  expect(hierarchy.getPathById("child1")).toBe("0/0")
  expect(hierarchy.getPathById("child2")).toBe("0/1")
  expect(hierarchy.getPathById("nonexistent")).toBe(null)
})

test("ActorHierarchy - генерация корневых путей", () => {
  const hierarchy = new ActorHierarchy()

  // Сбрасываем счетчик
  hierarchy.resetPathCounter()

  // Генерируем несколько путей
  const path1 = hierarchy.generateRootPath()
  const path2 = hierarchy.generateRootPath()
  const path3 = hierarchy.generateRootPath()

  // Проверяем последовательность
  expect(path1).toBe("0")
  expect(path2).toBe("1")
  expect(path3).toBe("2")

  // Проверяем сброс счетчика
  hierarchy.resetPathCounter()
  const pathAfterReset = hierarchy.generateRootPath()
  expect(pathAfterReset).toBe("0")

  // Проверяем, что clear() также сбрасывает счетчик
  hierarchy.generateRootPath() // "1"
  hierarchy.generateRootPath() // "2"
  hierarchy.clear()
  const pathAfterClear = hierarchy.generateRootPath()
  expect(pathAfterClear).toBe("0")
})
