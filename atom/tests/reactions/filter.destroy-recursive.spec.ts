import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../meta/reactions"
import { describe, it, expect } from "bun:test"

type State = "idle" | "active"

describe("Фильтрация с destroy(recursive)", () => {
  it("destroy(recursive: false) должен работать в реакциях", () => {
    const core: { called: boolean } = { called: false }
    let destroyCalled = false
    let destroyRecursive: boolean = false

    // Создаем mock destroy функцию
    const mockDestroy = (recursive = true) => {
      destroyCalled = true
      destroyRecursive = recursive
    }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: "test" }))
            .equal(({ core, destroy }) => {
              core.called = true

              // Вызываем destroy с recursive: false
              destroy(false)
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: {},
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: mockDestroy,
    })

    expect(core.called, "реакция должна сработать").toBe(true)
    expect(destroyCalled, "destroy должен быть вызван").toBe(true)
    expect(destroyRecursive, "recursive должен быть false").toBe(false)
  })

  it("destroy(recursive: true) должен работать в реакциях", () => {
    const core: { called: boolean } = { called: false }
    let destroyCalled = false
    let destroyRecursive: boolean = false

    // Создаем mock destroy функцию
    const mockDestroy = (recursive = true) => {
      destroyCalled = true
      destroyRecursive = recursive
    }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: "test" }))
            .equal(({ core, destroy }) => {
              core.called = true

              // Вызываем destroy с recursive: true
              destroy(true)
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: {},
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: mockDestroy,
    })

    expect(core.called, "реакция должна сработать").toBe(true)
    expect(destroyCalled, "destroy должен быть вызван").toBe(true)
    expect(destroyRecursive, "recursive должен быть true").toBe(true)
  })

  it("destroy() без параметров должен использовать значение по умолчанию", () => {
    const core: { called: boolean } = { called: false }
    let destroyCalled = false
    let destroyRecursive: boolean = false

    // Создаем mock destroy функцию
    const mockDestroy = (recursive = true) => {
      destroyCalled = true
      destroyRecursive = recursive
    }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: "test" }))
            .equal(({ core, destroy }) => {
              core.called = true

              // Вызываем destroy без параметров
              destroy()
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: {},
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: mockDestroy,
    })

    expect(core.called, "реакция должна сработать").toBe(true)
    expect(destroyCalled, "destroy должен быть вызван").toBe(true)
    expect(destroyRecursive, "recursive должен быть true (по умолчанию)").toBe(true)
  })
})
