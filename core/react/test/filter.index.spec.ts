import { Reactions } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по индексу (index)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("простое сравнение числа", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: 5 })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
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
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: 5 })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 10 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция не должна сработать при несовпадении").toBe(false)
  })

  it("условие eq", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { eq: 5 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
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
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { notEq: 10 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notEq условии").toBe(true)
  })

  it("условие gt (больше)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { gt: 3 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при gt условии").toBe(true)
  })

  it("условие gte (больше или равно)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { gte: 5 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при gte условии").toBe(true)
  })

  it("условие lt (меньше)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { lt: 10 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при lt условии").toBe(true)
  })

  it("условие lte (меньше или равно)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { lte: 5 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при lte условии").toBe(true)
  })

  it("условие notGt (не больше)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { notGt: 10 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notGt условии").toBe(true)
  })

  it("условие notGte (не больше или равно)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { notGte: 10 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notGte условии").toBe(true)
  })

  it("условие notLt (не меньше)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { notLt: 3 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notLt условии").toBe(true)
  })

  it("условие notLte (не меньше или равно)", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { notLte: 3 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при notLte условии").toBe(true)
  })

  it("условие between", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { between: [1, 10] } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
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
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            index: {
              gte: 1,
              lt: 10,
              notEq: 3,
            },
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 5 },
      timestamp: Date.now(),
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированных условиях").toBe(true)
  })

  it("обработка undefined значения", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ index: { eq: 0 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 0,
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при undefined index (преобразуется в 0)").toBe(true)
  })
})
