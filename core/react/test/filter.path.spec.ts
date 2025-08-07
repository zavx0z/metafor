import { Reactions } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { MetaDataMessage } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по пути патча (path)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakeMeta: MetaDataMessage = { tag: "test", index: 0 }

  it("фильтрация по /context", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ path: "/context" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при path /context").toBe(true)
  })

  it("фильтрация по /state", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ path: "/state" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при path /state").toBe(true)
  })

  it("фильтрация по /", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ path: "/" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "add", path: "/", value: { context: {}, state: "idle" } },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при path /").toBe(true)
  })

  it("не срабатывает при несовпадении пути", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ path: "/context" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция не должна сработать при несовпадении пути").toBe(false)
  })

  it("комбинированная фильтрация с операцией", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/context",
            op: "replace",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированной фильтрации").toBe(true)
  })

  it("комбинированная фильтрация с метой", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/context",
            tag: "test",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированной фильтрации с тегом").toBe(true)
  })

  it("фильтрация по /context с replace", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/context",
            op: "replace",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при /context с replace").toBe(true)
  })

  it("фильтрация по /context с add", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/context",
            op: "add",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при /context с add").toBe(true)
  })

  it("фильтрация по /context с remove", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/context",
            op: "remove",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "remove", path: "/context" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при /context с remove").toBe(true)
  })

  it("фильтрация по /context с test", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/context",
            op: "test",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "test", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при /context с test").toBe(true)
  })

  it("фильтрация по /state с replace", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/state",
            op: "replace",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при /state с replace").toBe(true)
  })

  it("фильтрация по / с add", () => {
    let called = false
    const registry = new Reactions<Ctx, State, {}>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            path: "/",
            op: "add",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "add", path: "/", value: { context: {}, state: "idle" } },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при / с add").toBe(true)
  })
})
