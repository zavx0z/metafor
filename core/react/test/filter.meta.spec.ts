import { Reactions } from "../index"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по мете актора (meta)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("простое сравнение хеша меты", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: "test" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при точном совпадении").toBe(true)
  })

  it("не срабатывает при несовпадении", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: "test" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "other",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция не должна сработать при несовпадении").toBe(false)
  })

  it("регулярное выражение", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: /^test_/ })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при совпадении с regex").toBe(true)
  })

  it("условие eq", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { eq: "test" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при eq условии").toBe(true)
  })

  it("условие notEq", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { notEq: "other" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notEq условии").toBe(true)
  })

  it("условие startsWith", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { startsWith: "test" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при startsWith условии").toBe(true)
  })

  it("условие endsWith", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { endsWith: "component" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при endsWith условии").toBe(true)
  })

  it("условие include", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { include: "comp" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при include условии").toBe(true)
  })

  it("условие notInclude", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { notInclude: "bad" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notInclude условии").toBe(true)
  })

  it("условие notStartsWith", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { notStartsWith: "bad" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notStartsWith условии").toBe(true)
  })

  it("условие notEndsWith", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { notEndsWith: "bad" } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notEndsWith условии").toBe(true)
  })

  it("условие pattern (regex)", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { pattern: /^test_\d+$/ } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_123",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при pattern условии").toBe(true)
  })

  it("условие length (число)", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { length: 4 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при length условии (число)").toBe(true)
  })

  it("условие length (объект с min/max)", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { length: { min: 3, max: 10 } } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при length условии (min/max)").toBe(true)
  })

  it("условие between", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ meta: { between: ["a", "z"] } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при between условии").toBe(true)
  })

  it("комбинированные условия", () => {
    let called = false
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            meta: {
              startsWith: "test",
              include: "comp",
              length: { min: 10, max: 20 },
            },
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test_component",
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированных условиях").toBe(true)
  })
})
