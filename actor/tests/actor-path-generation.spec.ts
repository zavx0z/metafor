import { test, expect, beforeEach } from "bun:test"
import { Actor } from "../actor"
import { Fields } from "../src/fields"
let fields: Fields

beforeEach(() => {
  fields = Fields.get()
  Fields.set(new (Fields as any)())
  fields = Fields.get()
})

test("Actor - автоматическая генерация корневых путей", () => {
  // Создаем акторы без явного указания path
  const actor1 = Actor.fromSchema({
    meta: {
      name: "actor-1",
      context: {},
      states: { idle: {} },
      processes: {},
      reactions: { reactions: {}, states: {} },
      core: {},
    },
    id: "test1",
  })

  const actor2 = Actor.fromSchema({
    meta: {
      name: "actor-2",
      context: {},
      states: { idle: {} },
      processes: {},
      reactions: { reactions: {}, states: {} },
      core: {},
    },
    id: "test2",
  })

  const actor3 = Actor.fromSchema({
    meta: {
      name: "actor-3",
      context: {},
      states: { idle: {} },
      processes: {},
      reactions: { reactions: {}, states: {} },
      core: {},
    },
    id: "test3",
  })

  // Проверяем пути
  expect(actor1.path).toBe("0")
  expect(actor2.path).toBe("1")
  expect(actor3.path).toBe("2")

  // Проверяем, что id остается оригинальным
  expect(actor1.id).toBe("test1")
  expect(actor2.id).toBe("test2")
  expect(actor3.id).toBe("test3")

  // Очистка
  actor1.destroy()
  actor2.destroy()
  actor3.destroy()
})

test("Actor - явное указание path переопределяет автогенерацию", () => {
  const testSchema = {
    name: "test",
    context: {},
    states: { idle: {} },
    processes: {},
    reactions: { reactions: {}, states: {} },
    core: {},
  }

  // Создаем актор с явным path
  const actorWithPath = Actor.fromSchema({
    meta: testSchema,
    id: "test",
    path: "0", // явный путь
  })

  // Создаем актор без path (должен получить автогенерированный)
  const actorAutoPath = Actor.fromSchema({
    meta: testSchema,
    id: "test2",
  })

  // Проверяем пути
  expect(actorWithPath.path).toBe("0")
  expect(actorAutoPath.path).toBe("1") // следующий автогенерированный

  // Очистка
  actorWithPath.destroy()
  actorAutoPath.destroy()
})

test("Actor - счетчик путей инкрементируется корректно", () => {
  const testSchema = {
    name: "test",
    context: {},
    states: { idle: {} },
    processes: {},
    reactions: { reactions: {}, states: {} },
    core: {},
  }

  const actors: Actor[] = []

  // Создаем несколько акторов
  for (let i = 0; i < 5; i++) {
    const actor = Actor.fromSchema({
      meta: testSchema,
      id: `test${i}`,
    })
    actors.push(actor)
  }

  // Проверяем последовательность путей
  expect(actors[0]!.path).toBe("0")
  expect(actors[1]!.path).toBe("1")
  expect(actors[2]!.path).toBe("2")
  expect(actors[3]!.path).toBe("3")
  expect(actors[4]!.path).toBe("4")

  // Очистка
  actors.forEach((actor) => actor.destroy())
})

test("Actor.fromSchema - поддержка параметра path", () => {
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

  // Создаем актор с явным path через fromSchema
  const actorWithPath = Actor.fromSchema({
    meta: testSchema,
    id: "actor-with-path",
    path: "0", // простой путь
  })

  // Создаем актор без path (должен получить автогенерированный)
  const actorAutoPath = Actor.fromSchema({
    meta: testSchema,
    id: "actor-auto-path",
  })

  // Проверяем пути
  expect(actorWithPath.path).toBe("0")
  expect(actorAutoPath.path).toBe("1") // следующий автогенерированный

  // Очистка
  actorWithPath.destroy()
  actorAutoPath.destroy()
})
