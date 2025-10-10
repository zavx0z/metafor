import { test, expect } from "bun:test"
import type { ActorCommunication } from "../core/communication"
import {
  createActorStore,
  createActorNode,
  appendChild,
  insertBetween,
  getByIndexPath,
  moveBefore,
  moveAfter,
  reparentActor,
  getChildren,
  normalizeChildren,
  removeActor,
  getActor,
  hasActor,
} from "./index"

// Мок для ActorCommunication
class MockActor {
  constructor(public id: string) {}
  hasReactions() {
    return false
  }
  handleReactionMessage() {}
}

test("создание хранилища и узлов с позиционными путями", () => {
  const store = createActorStore()
  const actor = new MockActor("test-actor") as unknown as ActorCommunication

  createActorNode(store, "0", actor)
  expect(hasActor(store, "0")).toBe(true)
  expect(getActor(store, "0")).toBe(actor)
})

test("добавление детей и доступ по индексному пути", () => {
  const store = createActorStore()
  const actors = {
    root: new MockActor("root") as unknown as ActorCommunication,
    a: new MockActor("a") as unknown as ActorCommunication,
    b: new MockActor("b") as unknown as ActorCommunication,
    c: new MockActor("c") as unknown as ActorCommunication,
  }

  createActorNode(store, "0", actors.root)
  createActorNode(store, "0/0", actors.a)
  createActorNode(store, "0/1", actors.b)
  createActorNode(store, "0/2", actors.c)

  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")
  appendChild(store, "0", "0/2")

  const children = getChildren(store, "0")
  expect(children).toEqual(["0/0", "0/1", "0/2"])

  expect(getByIndexPath(store, "0", [0])).toEqual("0/0")
  expect(getByIndexPath(store, "0", [2])).toEqual("0/2")
})

test("вставка между соседями", () => {
  const store = createActorStore()
  const actors = ["root", "a", "b", "c", "x"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы с позиционными путями
  createActorNode(store, "0", actors[0]) // root
  createActorNode(store, "0/0", actors[1]) // a
  createActorNode(store, "0/1", actors[2]) // b
  createActorNode(store, "0/2", actors[3]) // c
  createActorNode(store, "0/3", actors[4]) // x

  // Добавляем детей к root
  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")
  appendChild(store, "0", "0/2")

  // Вставляем x между a и b
  insertBetween(store, "0/0", "0/1", "0/3")

  const children = getChildren(store, "0")
  expect(children).toEqual(["0/0", "0/3", "0/1", "0/2"])
})

test("перемещение акторов", () => {
  const store = createActorStore()
  const actors = ["root", "a", "b", "c"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0])
  createActorNode(store, "0/0", actors[1])
  createActorNode(store, "0/1", actors[2])
  createActorNode(store, "0/2", actors[3])

  // Добавляем детей
  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")
  appendChild(store, "0", "0/2")

  // Перемещаем c перед a
  moveBefore(store, "0/0", "0/2")
  expect(getChildren(store, "0")).toEqual(["0/2", "0/0", "0/1"])

  // Перемещаем c после a
  moveAfter(store, "0/0", "0/2")
  expect(getChildren(store, "0")).toEqual(["0/0", "0/2", "0/1"])
})

test("перепривязка и глубокий доступ", () => {
  const store = createActorStore()
  const actors = ["root", "a", "b", "a1"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0]) // root
  createActorNode(store, "0/0", actors[1]) // a
  createActorNode(store, "0/1", actors[2]) // b
  createActorNode(store, "0/0/0", actors[3]) // a1

  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")

  // Перепривязываем a1 к a
  reparentActor(store, "0/0", "0/0/0", { at: "end" })

  expect(getByIndexPath(store, "0", [0])).toEqual("0/0")
  expect(getByIndexPath(store, "0", [0, 0])).toEqual("0/0/0")
})

test("нормализация детей", () => {
  const store = createActorStore()
  const actors = ["root", "a", "b"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0])
  createActorNode(store, "0/0", actors[1])
  createActorNode(store, "0/1", actors[2])

  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")

  normalizeChildren(store, "0")

  const nodeA = store.arena.get("0/0")!
  const nodeB = store.arena.get("0/1")!

  expect(nodeA.order).toBe(0)
  expect(nodeB.order).toBe(1)
})

test("удаление актора", () => {
  const store = createActorStore()
  const actors = ["root", "a", "b"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0])
  createActorNode(store, "0/0", actors[1])
  createActorNode(store, "0/1", actors[2])

  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")

  // Удаляем актора a
  removeActor(store, "0/0")

  expect(hasActor(store, "0/0")).toBe(false)
  expect(getChildren(store, "0")).toEqual(["0/1"])
})

test("рекурсивное удаление", () => {
  const store = createActorStore()
  const actors = ["root", "a", "a1", "a2"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0])
  createActorNode(store, "0/0", actors[1])
  createActorNode(store, "0/0/0", actors[2])
  createActorNode(store, "0/0/1", actors[3])

  appendChild(store, "0", "0/0")
  appendChild(store, "0/0", "0/0/0")
  appendChild(store, "0/0", "0/0/1")

  // Рекурсивно удаляем a со всеми детьми
  removeActor(store, "0/0", true)

  expect(hasActor(store, "0/0")).toBe(false)
  expect(hasActor(store, "0/0/0")).toBe(false)
  expect(hasActor(store, "0/0/1")).toBe(false)
  expect(getChildren(store, "0")).toEqual([])
})

test("ошибка при вставке между соседями с разными родителями", () => {
  const store = createActorStore()
  const actors = ["root1", "root2", "a", "b", "x"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0]) // root1
  createActorNode(store, "1", actors[1]) // root2
  createActorNode(store, "0/0", actors[2]) // a под root1
  createActorNode(store, "1/0", actors[3]) // b под root2
  createActorNode(store, "2", actors[4]) // x

  appendChild(store, "0", "0/0")
  appendChild(store, "1", "1/0")

  // Попытка вставить x между a и b (разные родители)
  expect(() => {
    insertBetween(store, "0/0", "1/0", "2")
  }).toThrow("Neighbors must share the same parent")
})

test("работа с глубокими позиционными путями", () => {
  const store = createActorStore()
  const actors = ["root", "child", "grandchild"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы с глубокими путями
  createActorNode(store, "0", actors[0]) // root
  createActorNode(store, "0/0", actors[1]) // child
  createActorNode(store, "0/0/0", actors[2]) // grandchild

  appendChild(store, "0", "0/0")
  appendChild(store, "0/0", "0/0/0")

  expect(getByIndexPath(store, "0", [0])).toEqual("0/0")
  expect(getByIndexPath(store, "0", [0, 0])).toEqual("0/0/0")
})

test("ленивая сортировка витрины", () => {
  const store = createActorStore()
  const actors = ["root", "a", "b", "c"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем узлы
  createActorNode(store, "0", actors[0])
  createActorNode(store, "0/0", actors[1])
  createActorNode(store, "0/1", actors[2])
  createActorNode(store, "0/2", actors[3])

  appendChild(store, "0", "0/0")
  appendChild(store, "0", "0/1")
  appendChild(store, "0", "0/2")

  // Проверяем, что витрина помечена как грязная
  expect(store.dirty.has("0")).toBe(true)

  // Первый вызов getChildren должен очистить dirty флаг
  const children1 = getChildren(store, "0")
  expect(store.dirty.has("0")).toBe(false)

  // Второй вызов не должен пересортировывать
  const children2 = getChildren(store, "0")
  expect(children1).toEqual(children2) // Должны содержать одинаковые элементы
})

test("корневые узлы без родителя", () => {
  const store = createActorStore()
  const actors = ["root1", "root2"].map((id) => new MockActor(id) as unknown as ActorCommunication)

  // Создаем корневые узлы
  createActorNode(store, "0", actors[0])
  createActorNode(store, "1", actors[1])

  // Корневые узлы не имеют родителя
  expect(store.arena.get("0")!.parent).toBe(null)
  expect(store.arena.get("1")!.parent).toBe(null)

  // Получаем детей корневого уровня (null parent)
  appendChild(store, null, "0")
  appendChild(store, null, "1")

  const rootChildren = getChildren(store, null)
  expect(rootChildren).toEqual(["0", "1"])
})
