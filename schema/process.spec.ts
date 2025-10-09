import { test, describe, expect } from "bun:test"
import { processesSchema } from "./process.ts"
import { contextSchema } from "@zavx0z/context"
import type { ProcessesDeclaration } from "./process.t.ts"

describe("parseChainsObject — разные варианты chain", () => {
  test("action, success, error варианты", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
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
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      onlyAction: {
        action: { read: ["foo"], src: expect.any(String) },
      },
      onlySuccess: {
        action: { read: ["foo"], src: expect.any(String) },
        success: { write: ["foo"], src: expect.any(String) },
      },
      onlyError: {
        action: { read: ["foo"], src: expect.any(String) },
        error: { write: ["bar"], src: expect.any(String) },
      },
      allHandlers: {
        action: { read: ["foo"], src: expect.any(String) },
        success: { write: ["foo"], src: expect.any(String) },
        error: { write: ["bar"], src: expect.any(String) },
      },
    })
  })

  test("пустой объект", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    type C = typeof schema
    type S = never
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({})
    const snapshot = processesSchema(actions)
    expect(snapshot, "пустой объект возвращает null").toBeNull()
  })

  test("один процесс", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    type C = typeof schema
    type S = "single"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      single: process().action(({ context }) => context.foo),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      single: { action: { read: ["foo"], src: expect.any(String) } },
    })
  })

  test("несколько процессов", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    type C = typeof schema
    type S = "first" | "second"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      first: process().action(({ context }) => context.foo),
      second: process().action(({ context }) => context.bar),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      first: { action: { read: ["foo"], src: expect.any(String) } },
      second: { action: { read: ["bar"], src: expect.any(String) } },
    })
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    type C = typeof schema
    type S = "string" | "number" | "object"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      string: process().action(({ context }) => context.foo),
      number: process().action(({ context }) => context.bar),
      object: process().action(({ context }) => ({ foo: context.foo, bar: context.bar })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      string: { action: { read: ["foo"], src: expect.any(String) } },
      number: { action: { read: ["bar"], src: expect.any(String) } },
      object: { action: { read: ["foo", "bar"], src: expect.any(String) } },
    })
  })

  test("процессы с async функциями", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    type C = typeof schema
    type S = "async"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      async: process().action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return context.foo
      }),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      async: { action: { read: ["foo"], src: expect.any(String) } },
    })
  })

  test("процессы с success и error обработчиками", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    type C = typeof schema
    type S = "withHandlers"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      withHandlers: process()
        .action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 42 })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      withHandlers: {
        action: { read: ["foo"], src: expect.any(String) },
        success: { write: ["foo"], src: expect.any(String) },
        error: { write: ["bar"], src: expect.any(String) },
      },
    })
  })

  test("процессы с title и description", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    type C = typeof schema
    type S = "withMeta"
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      withMeta: process({ label: "test_process", desc: "Test process description" }).action(
        ({ context }) => context.foo
      ),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      withMeta: {
        title: "test_process",
        description: "Test process description",
        action: { read: ["foo"], src: expect.any(String) },
      },
    })
  })

  test("сохранение строкового представления action функции", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    type C = typeof schema
    type S = "sourceTest"

    const actionFn = ({ context }: any) => context.foo + context.bar
    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      sourceTest: process().action(actionFn),
    })
    const snapshot = processesSchema(actions)

    expect(snapshot?.sourceTest?.action?.src, "сохранено строковое представление action").toBe(actionFn.toString())
    expect(snapshot?.sourceTest?.action?.read, "прочитаны поля контекста").toEqual(["foo", "bar"])
  })

  test("сохранение строкового представления всех обработчиков", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    type C = typeof schema
    type S = "allHandlersTest"

    const actionFn = ({ context }: any) => context.foo
    const successFn = ({ update, data }: any) => update({ result: data })
    const errorFn = ({ update, error }: any) => update({ error: error.message })

    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      allHandlersTest: process().action(actionFn).success(successFn).error(errorFn),
    })
    const snapshot = processesSchema(actions)

    expect(snapshot?.allHandlersTest?.action?.src, "сохранено строковое представление action").toBe(actionFn.toString())
    expect(snapshot?.allHandlersTest?.success?.src, "сохранено строковое представление success").toBe(
      successFn.toString()
    )
    expect(snapshot?.allHandlersTest?.error?.src, "сохранено строковое представление error").toBe(errorFn.toString())
  })
})

describe("parseChain — несколько chain", () => {
  test("корректно парсит объект с несколькими chain", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
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
    const snapshot = processesSchema(actions)

    expect(snapshot).toMatchObject({
      first: {
        action: { read: ["foo"], src: expect.any(String) },
        success: { write: ["foo"], src: expect.any(String) },
      },
      second: {
        action: { read: ["bar"], src: expect.any(String) },
        error: { write: ["bar"], src: expect.any(String) },
      },
    })
  })

  test("смешанные типы процессов", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
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
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchObject({
      simple: { action: { read: ["foo"], src: expect.any(String) } },
      complex: {
        action: { read: ["foo", "bar"], src: expect.any(String) },
        success: { write: ["foo"], src: expect.any(String) },
        error: { write: ["bar"], src: expect.any(String) },
      },
      async: { action: { read: ["foo"], src: expect.any(String) } },
    })
  })
})
