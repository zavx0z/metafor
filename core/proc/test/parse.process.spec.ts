import { test, describe, expect } from "bun:test"
import { getSnapshotProcesses } from "../parser.ts"
import { types } from "../../context"
import type { ProcessesDeclaration } from "../index.t.ts"

describe("parseChainsObject — разные варианты chain", () => {
  test("action, success, error варианты", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type C = typeof schema
    type S = "onlyAction" | "onlySuccess" | "onlyError" | "allHandlers"

    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      onlyAction: process().action(({ context }) => context.foo),
      onlySuccess: process()
        .action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data })),
      onlyError: process()
        .action(({ context }) => context.foo)
        .error(({ update, error }) => update({ bar: 1 })),
      allHandlers: process()
        .action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 2 })),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      onlyAction: { action: { read: ["foo"] } },
      onlySuccess: { action: { read: ["foo"] }, success: { read: [], write: ["foo"] } },
      onlyError: { action: { read: ["foo"] }, error: { read: [], write: ["bar"] } },
      allHandlers: {
        action: { read: ["foo"] },
        success: { read: [], write: ["foo"] },
        error: { read: [], write: ["bar"] },
      },
    })
  })

  test("пустой объект", () => {
    const schema = { foo: types.string.required("a") }
    type C = typeof schema
    type S = never
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({})
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({})
  })

  test("один процесс", () => {
    const schema = { foo: types.string.required("a") }
    type C = typeof schema
    type S = "single"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      single: process().action(({ context }) => context.foo),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      single: { action: { read: ["foo"] } },
    })
  })

  test("несколько процессов", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type C = typeof schema
    type S = "first" | "second"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      first: process().action(({ context }) => context.foo),
      second: process().action(({ context }) => context.bar),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      first: { action: { read: ["foo"] } },
      second: { action: { read: ["bar"] } },
    })
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type C = typeof schema
    type S = "string" | "number" | "object"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      string: process().action(({ context }) => context.foo),
      number: process().action(({ context }) => context.bar),
      object: process().action(({ context }) => ({ foo: context.foo, bar: context.bar })),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      string: { action: { read: ["foo"] } },
      number: { action: { read: ["bar"] } },
      object: { action: { read: ["foo", "bar"] } },
    })
  })

  test("процессы с async функциями", () => {
    const schema = { foo: types.string.required("a") }
    type C = typeof schema
    type S = "async"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      async: process().action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return context.foo
      }),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      async: { action: { read: ["foo"] } },
    })
  })

  test("процессы с success и error обработчиками", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type C = typeof schema
    type S = "withHandlers"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      withHandlers: process()
        .action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 42 })),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      withHandlers: {
        action: { read: ["foo"] },
        success: { read: [], write: ["foo"] },
        error: { read: [], write: ["bar"] },
      },
    })
  })

  test("процессы с title и description", () => {
    const schema = { foo: types.string.required("a") }
    type C = typeof schema
    type S = "withMeta"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      withMeta: process({ title: "test_process", description: "Test process description" }).action(
        ({ context }) => context.foo
      ),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      withMeta: {
        title: "test_process",
        description: "Test process description",
        action: { read: ["foo"] },
      },
    })
  })
})

describe("parseChain — несколько chain", () => {
  test("корректно парсит объект с несколькими chain", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type C = typeof schema
    type S = "first" | "second"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      first: process()
        .action(({ context }) => ({ foo: context.foo }))
        .success(({ update, data }) => update({ foo: data.foo })),
      second: process()
        .action(({ context }) => ({ bar: context.bar }))
        .error(({ update, error }) => update({ bar: 42 })),
    })
    const snapshot = getSnapshotProcesses(actions)

    expect(snapshot).toMatchObject({
      first: { action: { read: ["foo"] }, success: { read: [], write: ["foo"] }, error: { read: [], write: ["bar"] } },
      second: { action: { read: ["bar"] }, error: { read: [], write: ["bar"] } },
    })
  })

  test("смешанные типы процессов", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type C = typeof schema
    type S = "simple" | "complex" | "async"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      simple: process().action(({ context }) => context.foo),
      complex: process()
        .action(({ context }) => ({ foo: context.foo, bar: context.bar }))
        .success(({ update, data }) => update({ foo: data.foo }))
        .error(({ update, error }) => update({ bar: 0 })),
      async: process().action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return context.foo
      }),
    })
    const snapshot = getSnapshotProcesses(actions)
    expect(snapshot).toMatchObject({
      simple: { action: { read: ["foo"] } },
      complex: {
        action: { read: ["foo", "bar"] },
        success: { read: [], write: ["foo"] },
        error: { read: [], write: ["bar"] },
      },
      async: { action: { read: ["foo"] } },
    })
  })
})
