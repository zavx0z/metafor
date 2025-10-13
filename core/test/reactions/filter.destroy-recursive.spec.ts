import { reactionsFromSchema } from "../../reactions"
import { reactionsSchema } from "../../../schema/reactions"
import { describe, it, expect } from "bun:test"

type State = "idle" | "active"

describe("Фильтрация с destroy(recursive)", () => {
  it("destroy(recursive: false) должен работать в реакциях", () => {
    const core: { called: boolean } = { called: false }
    let destroyCalled = false
    let destroyRecursive: boolean | undefined = undefined

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
            .equal(({ core, self }) => {
              core.called = true

              // Вызываем destroy с recursive: false
              self.destroy(false)
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: {},
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "test-actor", path: "0", destroy: mockDestroy },
    })

    expect(core.called, "реакция должна сработать").toBe(true)
    expect(destroyCalled, "destroy должен быть вызван").toBe(true)
    expect(destroyRecursive, "recursive должен быть false").toBe(false)
  })

  it("destroy(recursive: true) должен работать в реакциях", () => {
    const core: { called: boolean } = { called: false }
    let destroyCalled = false
    let destroyRecursive: boolean | undefined = undefined

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
            .equal(({ core, self }) => {
              core.called = true

              // Вызываем destroy с recursive: true
              self.destroy(true)
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: {},
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "test-actor", path: "0", destroy: mockDestroy },
    })

    expect(core.called, "реакция должна сработать").toBe(true)
    expect(destroyCalled, "destroy должен быть вызван").toBe(true)
    expect(destroyRecursive, "recursive должен быть true").toBe(true)
  })

  it("destroy() без параметров должен использовать значение по умолчанию", () => {
    const core: { called: boolean } = { called: false }
    let destroyCalled = false
    let destroyRecursive: boolean | undefined = undefined

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
            .equal(({ core, self }) => {
              core.called = true

              // Вызываем destroy без параметров
              self.destroy()
            }),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: {},
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "test-actor", path: "0", destroy: mockDestroy },
    })

    expect(core.called, "реакция должна сработать").toBe(true)
    expect(destroyCalled, "destroy должен быть вызван").toBe(true)
    expect(destroyRecursive, "recursive должен быть true (по умолчанию)").toBe(true)
  })
})
