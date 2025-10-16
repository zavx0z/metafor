import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../electromagnetic/electromagnetic.t"
import { reactionsFromSchema } from "../../week/reactions"
import { reactionsSchema } from "../../../meta/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по мете актора (meta)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("простое сравнение имени меты", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: "test" }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при точном совпадении").toBe(true)
  })

  it("не срабатывает при несовпадении", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: "test" }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "other",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция не должна сработать при несовпадении").toBe(false)
  })

  it("регулярное выражение", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: /^test_/ }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при совпадении с regex").toBe(true)
  })

  it("условие eq", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { eq: "test" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при eq условии").toBe(true)
  })

  it("условие notEq", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notEq: "other" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при notEq условии").toBe(true)
  })

  it("условие startsWith", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { startsWith: "test" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при startsWith условии").toBe(true)
  })

  it("условие endsWith", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { endsWith: "component" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при endsWith условии").toBe(true)
  })

  it("условие include", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { include: "comp" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при include условии").toBe(true)
  })

  it("условие notInclude", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notInclude: "bad" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при notInclude условии").toBe(true)
  })

  it("условие notStartsWith", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notStartsWith: "bad" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при notStartsWith условии").toBe(true)
  })

  it("условие notEndsWith", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notEndsWith: "bad" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при notEndsWith условии").toBe(true)
  })

  it("условие pattern (regex)", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { pattern: /^test_\d+$/ } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_123",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при pattern условии").toBe(true)
  })

  it("условие length (число)", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { length: 4 } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при length условии (число)").toBe(true)
  })

  it("условие length (объект с min/max)", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { length: { min: 3, max: 10 } } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при length условии (min/max)").toBe(true)
  })

  it("условие between", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { between: ["a", "z"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при between условии").toBe(true)
  })

  it("комбинированные условия", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              meta: {
                startsWith: "test",
                include: "comp",
                length: { min: 10, max: 20 },
              },
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test_component",
      actor: "id",
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при комбинированных условиях").toBe(true)
  })
})
