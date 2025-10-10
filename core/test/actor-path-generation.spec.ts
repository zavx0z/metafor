import { test, expect } from "bun:test"
import { Actor } from "../../actor"
import { contextFromSchema } from "@zavx0z/context"
import { processesFromSchema } from "../processes"
import { reactionsFromSchema } from "../reactions"

// Мок данные для создания Actor
const mockSchema = {}
const mockContext = contextFromSchema(mockSchema)
const mockStates = { current: "idle", states: { idle: {} } }
const mockProcesses = processesFromSchema({})
const mockReactions = reactionsFromSchema({ reactions: {} })
const mockRender = []

test("Actor - автоматическая генерация корневых путей", () => {
  // Сбрасываем счетчик перед тестом
  Actor.resetPathCounter()

  // Создаем акторы без явного указания path
  const actor1 = new Actor(
    "test1",
    "actor-1",
    "Test Actor 1",
    mockContext,
    mockStates,
    mockProcesses,
    mockReactions,
    mockRender
  )

  const actor2 = new Actor(
    "test2",
    "actor-2",
    "Test Actor 2",
    mockContext,
    mockStates,
    mockProcesses,
    mockReactions,
    mockRender
  )

  const actor3 = new Actor(
    "test3",
    "actor-3",
    "Test Actor 3",
    mockContext,
    mockStates,
    mockProcesses,
    mockReactions,
    mockRender
  )

  // Проверяем, что пути генерируются автоматически как "0", "1", "2"
  expect(actor1.path).toBe("0")
  expect(actor2.path).toBe("1")
  expect(actor3.path).toBe("2")

  // Проверяем, что id остается оригинальным
  expect(actor1.id).toBe("actor-1")
  expect(actor2.id).toBe("actor-2")
  expect(actor3.id).toBe("actor-3")

  // Очистка
  actor1.destroy()
  actor2.destroy()
  actor3.destroy()
})

test("Actor - явное указание path переопределяет автогенерацию", () => {
  // Сбрасываем счетчик
  Actor.resetPathCounter()

  // Создаем актор с явным path
  const actorWithPath = new Actor(
    "test",
    "actor-custom",
    "Test Actor",
    mockContext,
    mockStates,
    mockProcesses,
    mockReactions,
    mockRender,
    {}, // core
    "custom/path/0/1" // explicit path
  )

  // Создаем актор без path (должен получить автогенерированный)
  const actorAutoPath = new Actor(
    "test2",
    "actor-auto",
    "Test Actor Auto",
    mockContext,
    mockStates,
    mockProcesses,
    mockReactions,
    mockRender
  )

  // Проверяем пути
  expect(actorWithPath.path).toBe("custom/path/0/1")
  expect(actorAutoPath.path).toBe("0") // первый автогенерированный

  // Очистка
  actorWithPath.destroy()
  actorAutoPath.destroy()
})

test("Actor - счетчик путей инкрементируется корректно", () => {
  // Сбрасываем счетчик
  Actor.resetPathCounter()

  const actors: Actor[] = []

  // Создаем несколько акторов
  for (let i = 0; i < 5; i++) {
    const actor = new Actor(
      `test${i}`,
      `actor-${i}`,
      `Test Actor ${i}`,
      mockContext,
      mockStates,
      mockProcesses,
      mockReactions,
      mockRender
    )
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
  // Сбрасываем счетчик
  Actor.resetPathCounter()

  const testSchema = {
    name: "test",
    description: "Test schema",
    context: {},
    states: { idle: {} },
    processes: {},
    reactions: { reactions: {}, states: {} },
    render: [],
  }

  // Создаем актор с явным path через fromSchema
  const actorWithPath = Actor.fromSchema({
    meta: testSchema,
    id: "actor-with-path",
    path: "custom/0/1",
  })

  // Создаем актор без path (должен получить автогенерированный)
  const actorAutoPath = Actor.fromSchema({
    meta: testSchema,
    id: "actor-auto-path",
  })

  // Проверяем пути
  expect(actorWithPath.path).toBe("custom/0/1")
  expect(actorAutoPath.path).toBe("0") // первый автогенерированный

  // Очистка
  actorWithPath.destroy()
  actorAutoPath.destroy()
})
