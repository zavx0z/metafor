/**
 * Тесты для модуля graph.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import {
  appendChild,
  insertBefore,
  removeChild,
  replaceChild,
  moveChild,
  removeChildWithDescendants,
  hasChildren,
  getChildren,
  getRoots,
  getIndexPathByUuid,
  getUuidByIndexPath,
  computeIndexPath,
  setOrderKey,
  resetGraphStore,
} from "./graph"
import { first, between } from "./order"

describe("graph", () => {
  beforeEach(() => {
    resetGraphStore()
  })

  describe("appendChild()", () => {
    test("добавляет корневой атом", () => {
      const uuid = "uuid-1"
      appendChild(null, uuid)
      setOrderKey(uuid, first())

      const roots = getRoots()
      expect(roots).toContain(uuid)
    })

    test("добавляет в конец детей", () => {
      const parent = "parent-1"
      const child1 = "child-1"
      const child2 = "child-2"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child1)
      setOrderKey(child1, first())
      appendChild(parent, child2)
      setOrderKey(child2, between(first(), null))

      const children = getChildren(parent)
      expect(children).toEqual([child1, child2])
    })
  })

  describe("insertBefore()", () => {
    test("вставляет перед sibling", () => {
      const parent = "parent-1"
      const child1 = "child-1"
      const child2 = "child-2"
      const newChild = "new-child"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child1)
      setOrderKey(child1, first())
      appendChild(parent, child2)
      setOrderKey(child2, between(first(), null))

      insertBefore(parent, newChild, child2)
      setOrderKey(newChild, between(first(), between(first(), null)))

      const children = getChildren(parent)
      expect(children).toEqual([child1, newChild, child2])
    })

    test("вставляет корневой перед другим", () => {
      const root1 = "root-1"
      const root2 = "root-2"
      const newRoot = "new-root"

      appendChild(null, root1)
      setOrderKey(root1, first())
      appendChild(null, root2)
      setOrderKey(root2, between(first(), null))

      insertBefore(null, newRoot, root2)
      setOrderKey(newRoot, between(first(), between(first(), null)))

      const roots = getRoots()
      expect(roots).toEqual([root1, newRoot, root2])
    })
  })

  describe("removeChild()", () => {
    test("удаляет атома (дети остаются)", () => {
      const parent = "parent-1"
      const child = "child-1"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child)
      setOrderKey(child, first())

      removeChild(parent, child)

      const children = getChildren(parent)
      expect(children).not.toContain(child)
    })

    test("удаляет корневого (дети остаются)", () => {
      const root = "root-1"
      const child = "child-1"

      appendChild(null, root)
      setOrderKey(root, first())
      appendChild(root, child)
      setOrderKey(child, first())

      removeChild(null, root)

      const roots = getRoots()
      expect(roots).not.toContain(root)
    })
  })

  describe("replaceChild()", () => {
    test("заменяет атома", () => {
      const parent = "parent-1"
      const oldChild = "old-child"
      const newChild = "new-child"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, oldChild)
      setOrderKey(oldChild, first())

      replaceChild(parent, newChild, oldChild)
      setOrderKey(newChild, first())

      const children = getChildren(parent)
      expect(children).toContain(newChild)
      expect(children).not.toContain(oldChild)
    })

    test("заменяет корневого", () => {
      const oldRoot = "old-root"
      const newRoot = "new-root"

      appendChild(null, oldRoot)
      setOrderKey(oldRoot, first())

      replaceChild(null, newRoot, oldRoot)
      setOrderKey(newRoot, first())

      const roots = getRoots()
      expect(roots).toContain(newRoot)
      expect(roots).not.toContain(oldRoot)
    })
  })

  describe("moveChild()", () => {
    test("перемещает к родителю", () => {
      const parent1 = "parent-1"
      const parent2 = "parent-2"
      const child = "child-1"

      appendChild(null, parent1)
      setOrderKey(parent1, first())
      appendChild(null, parent2)
      setOrderKey(parent2, between(first(), null))
      appendChild(parent1, child)
      setOrderKey(child, first())

      moveChild(child, parent2)

      const children1 = getChildren(parent1)
      const children2 = getChildren(parent2)

      expect(children1).not.toContain(child)
      expect(children2).toContain(child)
    })

    test("перемещает в корень", () => {
      const parent = "parent-1"
      const child = "child-1"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child)
      setOrderKey(child, first())

      moveChild(child, null)

      const roots = getRoots()
      expect(roots).toContain(child)
    })
  })

  describe("removeChildWithDescendants()", () => {
    test("удаляет атома + все потомки рекурсивно", () => {
      const root = "root-1"
      const child1 = "child-1"
      const grandchild = "grandchild-1"

      appendChild(null, root)
      setOrderKey(root, first())
      appendChild(root, child1)
      setOrderKey(child1, first())
      appendChild(child1, grandchild)
      setOrderKey(grandchild, first())

      removeChildWithDescendants(null, root)

      const roots = getRoots()
      expect(roots).not.toContain(root)
      expect(getIndexPathByUuid(child1)).toBeUndefined()
      expect(getIndexPathByUuid(grandchild)).toBeUndefined()
    })
  })

  describe("getChildren()", () => {
    test("возвращает массив childUuids", () => {
      const parent = "parent-1"
      const child1 = "child-1"
      const child2 = "child-2"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child1)
      setOrderKey(child1, first())
      appendChild(parent, child2)
      setOrderKey(child2, between(first(), null))

      const children = getChildren(parent)
      expect(children).toEqual([child1, child2])
    })

    test("возвращает пустой массив если нет детей", () => {
      const parent = "parent-1"

      appendChild(null, parent)
      setOrderKey(parent, first())

      const children = getChildren(parent)
      expect(children).toEqual([])
    })
  })

  describe("getRoots()", () => {
    test("возвращает rootUuids", () => {
      const root1 = "root-1"
      const root2 = "root-2"

      appendChild(null, root1)
      setOrderKey(root1, first())
      appendChild(null, root2)
      setOrderKey(root2, between(first(), null))

      const roots = getRoots()
      expect(roots).toEqual([root1, root2])
    })
  })

  describe("hasChildren()", () => {
    test("true если есть дети", () => {
      const parent = "parent-1"
      const child = "child-1"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child)
      setOrderKey(child, first())

      expect(hasChildren(parent)).toBe(true)
    })

    test("false если нет детей", () => {
      const parent = "parent-1"

      appendChild(null, parent)
      setOrderKey(parent, first())

      expect(hasChildren(parent)).toBe(false)
    })
  })

  describe("getIndexPathByUuid()", () => {
    test("возвращает indexPath", () => {
      const root = "root-1"
      const child = "child-1"

      appendChild(null, root)
      setOrderKey(root, first())
      appendChild(root, child)
      setOrderKey(child, first())

      const path = getIndexPathByUuid(child)
      expect(path).toBe("0/0")
    })
  })

  describe("getUuidByIndexPath()", () => {
    test("возвращает uuid по пути", () => {
      const root = "root-1"
      const child = "child-1"

      appendChild(null, root)
      setOrderKey(root, first())
      appendChild(root, child)
      setOrderKey(child, first())

      const uuid = getUuidByIndexPath("0/0")
      expect(uuid).toBe(child)
    })
  })

  describe("computeIndexPath()", () => {
    test("вычисляет путь для корневого атома", () => {
      const root = "root-1"

      appendChild(null, root)
      setOrderKey(root, first())

      const path = computeIndexPath(null, root)
      expect(path).toBe("0")
    })

    test("вычисляет путь для дочернего атома", () => {
      const parent = "parent-1"
      const child = "child-1"

      appendChild(null, parent)
      setOrderKey(parent, first())
      appendChild(parent, child)
      setOrderKey(child, first())

      const path = computeIndexPath(parent, child)
      expect(path).toBe("0/0")
    })
  })
})
