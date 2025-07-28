import { test, describe, expect } from "bun:test"
import { createActionsConfig } from "../index.ts"
import { types } from "../../context"

describe("parseChainsObject — разные варианты chain", () => {
  test("action, success, error варианты", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "onlyAction" | "onlySuccess" | "onlyError" | "allHandlers">((process) => ({
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
    }))
    expect(actions.onlyAction?.action, "onlyAction должен иметь action").toBeDefined()
    expect(actions.onlyAction?.success, "onlyAction не должен иметь success").toBeUndefined()
    expect(actions.onlyAction?.error, "onlyAction не должен иметь error").toBeUndefined()

    expect(actions.onlySuccess?.action, "onlySuccess должен иметь action").toBeDefined()
    expect(actions.onlySuccess?.success, "onlySuccess должен иметь success").toBeDefined()
    expect(actions.onlySuccess?.error, "onlySuccess не должен иметь error").toBeUndefined()

    expect(actions.onlyError?.action, "onlyError должен иметь action").toBeDefined()
    expect(actions.onlyError?.success, "onlyError не должен иметь success").toBeUndefined()
    expect(actions.onlyError?.error, "onlyError должен иметь error").toBeDefined()

    expect(actions.allHandlers?.action, "allHandlers должен иметь action").toBeDefined()
    expect(actions.allHandlers?.success, "allHandlers должен иметь success").toBeDefined()
    expect(actions.allHandlers?.error, "allHandlers должен иметь error").toBeDefined()
  })

  test("пустой объект", () => {
    const schema = { foo: types.string.required("a") }
    type S = typeof schema
    const actions = createActionsConfig<S, never>((process) => ({}))
    expect(Object.keys(actions), "Объект должен быть пустым").toHaveLength(0)
  })

  test("один процесс", () => {
    const schema = { foo: types.string.required("a") }
    type S = typeof schema
    const actions = createActionsConfig<S, "single">((process) => ({
      single: process().action(({ context }) => context.foo),
    }))
    expect(actions.single?.action, "Процесс должен быть определен").toBeDefined()
    expect(typeof actions.single?.action).toBe("function")
  })

  test("несколько процессов", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "first" | "second">((process) => ({
      first: process().action(({ context }) => context.foo),
      second: process().action(({ context }) => context.bar),
    }))
    expect(actions.first?.action, "Первый процесс должен быть определен").toBeDefined()
    expect(actions.second?.action, "Второй процесс должен быть определен").toBeDefined()
    expect(typeof actions.first?.action).toBe("function")
    expect(typeof actions.second?.action).toBe("function")
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "string" | "number" | "object">((process) => ({
      string: process().action(({ context }) => context.foo),
      number: process().action(({ context }) => context.bar),
      object: process().action(({ context }) => ({ foo: context.foo, bar: context.bar })),
    }))
    expect(actions.string?.action, "string процесс должен быть определен").toBeDefined()
    expect(actions.number?.action, "number процесс должен быть определен").toBeDefined()
    expect(actions.object?.action, "object процесс должен быть определен").toBeDefined()
  })

  test("процессы с async функциями", () => {
    const schema = { foo: types.string.required("a") }
    type S = typeof schema
    const actions = createActionsConfig<S, "async">((process) => ({
      async: process().action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return context.foo
      }),
    }))
    expect(actions.async?.action, "async процесс должен быть определен").toBeDefined()
    expect(typeof actions.async?.action).toBe("function")
  })

  test("процессы с success и error обработчиками", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "withHandlers">((process) => ({
      withHandlers: process()
        .action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 42 })),
    }))
    expect(actions.withHandlers?.action, "action должен быть определен").toBeDefined()
    expect(actions.withHandlers?.success, "success должен быть определен").toBeDefined()
    expect(actions.withHandlers?.error, "error должен быть определен").toBeDefined()
    expect(typeof actions.withHandlers?.action).toBe("function")
    expect(typeof actions.withHandlers?.success).toBe("function")
    expect(typeof actions.withHandlers?.error).toBe("function")
  })

  test("процессы с title и description", () => {
    const schema = { foo: types.string.required("a") }
    type S = typeof schema
    const actions = createActionsConfig<S, "withMeta">((process) => ({
      withMeta: process({ title: "test_process", description: "Test process description" }).action(
        ({ context }) => context.foo
      ),
    }))
    expect(actions.withMeta?.title, "title должен быть установлен").toBe("test_process")
    expect(actions.withMeta?.description, "description должен быть установлен").toBe("Test process description")
  })
})

describe("parseChain — несколько chain", () => {
  test("корректно парсит объект с несколькими chain", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "first" | "second">((process) => ({
      first: process()
        .action(({ context }) => ({ foo: context.foo }))
        .success(({ update, data }) => update({ foo: data.foo })),
      second: process()
        .action(({ context }) => ({ bar: context.bar }))
        .error(({ update, error }) => update({ bar: 42 })),
    }))
    if (!actions.first) throw new Error("actions.first is undefined")
    if (!actions.second) throw new Error("actions.second is undefined")

    expect(typeof actions.first.action).toBe("function")
    expect(typeof actions.first.success).toBe("function")
    expect(actions.first.error).toBeUndefined()

    expect(typeof actions.second.action).toBe("function")
    expect(typeof actions.second.error).toBe("function")
    expect(actions.second.success).toBeUndefined()
  })

  test("смешанные типы процессов", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "simple" | "complex" | "async">((process) => ({
      simple: process().action(({ context }) => context.foo),
      complex: process()
        .action(({ context }) => ({ foo: context.foo, bar: context.bar }))
        .success(({ update, data }) => update({ foo: data.foo }))
        .error(({ update, error }) => update({ bar: 0 })),
      async: process().action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return context.foo
      }),
    }))
    expect(actions.simple?.action, "simple процесс должен быть определен").toBeDefined()
    expect(actions.complex?.action, "complex процесс должен быть определен").toBeDefined()
    expect(actions.complex?.success, "complex процесс должен иметь success").toBeDefined()
    expect(actions.complex?.error, "complex процесс должен иметь error").toBeDefined()
    expect(actions.async?.action, "async процесс должен быть определен").toBeDefined()
  })
})
