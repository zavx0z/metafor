import { Reactions } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по временной метке (timestamp)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("простое сравнение числа", () => {
    let called = false
    const timestamp = Date.now()
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp,
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
          .filter({ timestamp: 1000 })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
    const timestamp = Date.now()
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { eq: timestamp } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp,
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
          .filter({ timestamp: { notEq: 1000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
          .filter({ timestamp: { gt: 1000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
    const timestamp = 2000
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { gte: timestamp } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp,
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
          .filter({ timestamp: { lt: 3000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
    const timestamp = 2000
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { lte: timestamp } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp,
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
          .filter({ timestamp: { notGt: 3000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
          .filter({ timestamp: { notGte: 3000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
          .filter({ timestamp: { notLt: 1000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { notLte: 1000 } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
          .filter({ timestamp: { between: [1000, 3000] } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
            timestamp: {
              gte: 1000,
              lt: 3000,
              notEq: 1500,
            },
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
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
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { eq: 0 } })
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

    expect(called, "реакция должна сработать при undefined timestamp (преобразуется в 0)").toBe(true)
  })

  it("фильтрация по времени (последняя минута)", () => {
    let called = false
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { gte: oneMinuteAgo } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: now,
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать для сообщений последней минуты").toBe(true)
  })

  it("фильтрация по диапазону времени", () => {
    let called = false
    const startTime = 1000
    const endTime = 3000
    const registry = new Reactions<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ timestamp: { between: [startTime, endTime] } })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: "test",
      actor: { index: 0 },
      timestamp: 2000,
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать для сообщений в диапазоне времени").toBe(true)
  })
})
