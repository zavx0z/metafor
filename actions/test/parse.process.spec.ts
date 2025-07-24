import { describe, test, expect } from "bun:test"
import { parseFunction, parseProcess, parseChain, parseChainsObject } from "../parser"
import { createActionsConfig } from "../index"
import { types } from "../../context"

describe("parseFunction — извлечение read/write", () => {
  test("context.dot", () => {
    function bodyDot({ context, update }: any) {
      // @ts-ignore
      console.debug(context.b)
      // @ts-ignore
      update({ a: 3 })
    }
    expect(parseFunction(bodyDot)).toEqual({ read: ["b"], write: ["a"] })
  })

  test("деструктуризация в аргументах", () => {
    function argDestruct({ context: { a }, update }: any) {
      // @ts-ignore
      console.debug(a)
      // @ts-ignore
      update({ a: 4 })
    }
    expect(parseFunction(argDestruct)).toEqual({ read: ["a"], write: ["a"] })
  })

  test("множественная деструктуризация", () => {
    function multipleDestruct({ context }: any) {
      // @ts-ignore
      const { a } = context
      // @ts-ignore
      const { b, c } = context
      // @ts-ignore
      console.debug(a, b, c)
      // @ts-ignore
      update({ a: 1 })
    }
    expect(parseFunction(multipleDestruct)).toEqual({ read: ["a", "b", "c"], write: ["a"] })
  })

  test("деструктуризация с переименованием", () => {
    function renamedDestruct({ context, update }: any) {
      // @ts-ignore
      const { a: value } = context
      // @ts-ignore
      update({ a: value + 1 })
    }
    expect(parseFunction(renamedDestruct)).toEqual({ read: ["a"], write: ["a"] })
  })

  test("вложенный доступ к свойствам", () => {
    function nestedAccess({ context, update }: any) {
      // @ts-ignore
      console.debug(context.a, context.b.length)
      // @ts-ignore
      update({ a: 5, b: "test" })
    }
    expect(parseFunction(nestedAccess)).toEqual({ read: ["a", "b"], write: ["a", "b"] })
  })

  test("отсутствие чтения или записи", () => {
    function noReadWrite() {
      // @ts-ignore
      console.debug("No read or write")
    }
    expect(parseFunction(noReadWrite)).toEqual({ read: [], write: [] })
  })
})

describe("parseProcess — извлечение read/write по процессу", () => {
  test("action, success, error", () => {
    function action({ context }: any) {
      return { foo: context.a, bar: context.b }
    }
    function success({ update, data }: any) {
      update({ a: data.foo })
    }
    function error({ update, error }: any) {
      update({ b: 42 })
    }
    expect(parseProcess({ action, success, error })).toEqual({
      action: {
        fn: action,
        read: ["a", "b"],
      },
      success: {
        fn: success,
        read: [],
        write: ["a"],
      },
      error: {
        fn: error,
        read: [],
        write: ["b"],
      },
    })
  })

  test("только action", () => {
    function action({ context }: any) {
      return context.a
    }
    expect(parseProcess({ action })).toEqual({
      action: {
        fn: action,
        read: ["a"],
      },
    })
  })
})

describe("parseChain", () => {
  test("корректно парсит chain", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "test">((action) => ({
      test: action(({ context }) => ({ foo: context.foo, bar: context.bar }))
        .success(({ update, data }) => update({ foo: data.foo }))
        .error(({ update, error }) => update({ bar: 42 })),
    }))
    // chain это Process, а не ActionChain, поэтому для теста создадим ActionChain вручную
    // Но если actions.test это chain, то можно напрямую
    // @ts-ignore
    const parsed = parseChain(actions.test)
    expect(parsed, "парсинг chain с success и error").toEqual({
      action: {
        fn: expect.any(Function),
        read: ["foo", "bar"],
      },
      success: {
        fn: expect.any(Function),
        read: [],
        write: ["foo"],
      },
      error: {
        fn: expect.any(Function),
        read: [],
        write: ["bar"],
      },
    })
  })
})

describe("parseChainsObject — разные варианты chain", () => {
  test("action, success, error варианты", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "onlyAction" | "onlySuccess" | "onlyError" | "allHandlers">((action) => ({
      onlyAction: action(({ context }) => context.foo),
      onlySuccess: action(({ context }) => context.foo).success(({ update, data }) => update({ foo: data })),
      onlyError: action(({ context }) => context.foo).error(({ update, error }) => update({ bar: 1 })),
      allHandlers: action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 2 })),
    }))
    if (!actions.onlyAction) throw new Error("actions.onlyAction is undefined")
    if (!actions.onlySuccess) throw new Error("actions.onlySuccess is undefined")
    if (!actions.onlyError) throw new Error("actions.onlyError is undefined")
    if (!actions.allHandlers) throw new Error("actions.allHandlers is undefined")
    const parsedAll = parseChainsObject(actions)
    expect(parsedAll, "парсинг вариантов action/success/error").toEqual({
      onlyAction: {
        action: {
          fn: expect.any(Function),
          read: ["foo"],
        },
      },
      onlySuccess: {
        action: {
          fn: expect.any(Function),
          read: ["foo"],
        },
        success: {
          fn: expect.any(Function),
          read: [],
          write: ["foo"],
        },
      },
      onlyError: {
        action: {
          fn: expect.any(Function),
          read: ["foo"],
        },
        error: {
          fn: expect.any(Function),
          read: [],
          write: ["bar"],
        },
      },
      allHandlers: {
        action: {
          fn: expect.any(Function),
          read: ["foo"],
        },
        success: {
          fn: expect.any(Function),
          read: [],
          write: ["foo"],
        },
        error: {
          fn: expect.any(Function),
          read: [],
          write: ["bar"],
        },
      },
    })
  })
})

describe("parseChain — несколько chain", () => {
  test("корректно парсит объект с несколькими chain", () => {
    const schema = { foo: types.string.required("a"), bar: types.number.required(0) }
    type S = typeof schema
    const actions = createActionsConfig<S, "first" | "second">((action) => ({
      first: action(({ context }) => ({ foo: context.foo })).success(({ update, data }) => update({ foo: data.foo })),
      second: action(({ context }) => ({ bar: context.bar })).error(({ update, error }) => update({ bar: 42 })),
    }))
    if (!actions.first) throw new Error("actions.first is undefined")
    if (!actions.second) throw new Error("actions.second is undefined")
    const parsedAll = parseChainsObject(actions)
    expect(parsedAll, "парсинг всех chain").toEqual({
      first: {
        action: {
          fn: expect.any(Function),
          read: ["foo"],
        },
        success: {
          fn: expect.any(Function),
          read: [],
          write: ["foo"],
        },
      },
      second: {
        action: {
          fn: expect.any(Function),
          read: ["bar"],
        },
        error: {
          fn: expect.any(Function),
          read: [],
          write: ["bar"],
        },
      },
    })
  })
})
