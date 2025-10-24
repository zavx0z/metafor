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
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "allHandlers": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "error": {
            "src": "({ update, error }) => update({ bar: 2 }, "e")",
            "write": [
              "bar",
            ],
          },
          "success": {
            "src": "({ update, data }) => update({ foo: data }, "s")",
            "write": [
              "foo",
            ],
          },
          "type": "action",
        },
        "onlyAction": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "type": "action",
        },
        "onlyError": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "error": {
            "src": "({ update, error }) => update({ bar: 1 }, "e")",
            "write": [
              "bar",
            ],
          },
          "type": "action",
        },
        "onlySuccess": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "success": {
            "src": "({ update, data }) => update({ foo: data }, "s")",
            "write": [
              "foo",
            ],
          },
          "type": "action",
        },
      }
    `)
  })

  test("пустой объект", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, never, {}> = (process) => ({})
    const snapshot = processesSchema(actions)
    expect(snapshot, "пустой объект возвращает пустой объект").toEqual({})
  })

  test("один процесс", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "single", {}> = (process) => ({
      single: process().action(({ context }) => context.foo),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "single": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "type": "action",
        },
      }
    `)
  })

  test("несколько процессов", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => ({
      first: process().action(({ context }) => context.foo),
      second: process().action(({ context }) => context.bar),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "first": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "type": "action",
        },
        "second": {
          "action": {
            "read": [
              "bar",
            ],
            "src": "({ context }) => context.bar",
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "string" | "number" | "object", {}> = (process) => ({
      string: process().action(({ context }) => context.foo),
      number: process().action(({ context }) => context.bar),
      object: process().action(({ context }) => ({ foo: context.foo, bar: context.bar })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "number": {
          "action": {
            "read": [
              "bar",
            ],
            "src": "({ context }) => context.bar",
          },
          "type": "action",
        },
        "object": {
          "action": {
            "read": [
              "foo",
              "bar",
            ],
            "src": "({ context }) => ({ foo: context.foo, bar: context.bar })",
          },
          "type": "action",
        },
        "string": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с async функциями", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "async", {}> = (process) => ({
      async: process().action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return context.foo
      }),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "async": {
          "action": {
            "read": [
              "foo",
            ],
            "src": 
      "async ({ context }) => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              return context.foo;
            }"
      ,
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с success и error обработчиками", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "withHandlers", {}> = (process) => ({
      withHandlers: process()
        .action(({ context }) => context.foo)
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 42 })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "withHandlers": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "error": {
            "src": "({ update, error }) => update({ bar: 42 }, "e")",
            "write": [
              "bar",
            ],
          },
          "success": {
            "src": "({ update, data }) => update({ foo: data }, "s")",
            "write": [
              "foo",
            ],
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с label и desc", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "withMeta", {}> = (process) => ({
      withMeta: process({ label: "test_process", desc: "Test process description" }).action(
        ({ context }) => context.foo
      ),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "withMeta": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => context.foo",
          },
          "desc": "Test process description",
          "label": "test_process",
          "type": "action",
        },
      }
    `)
  })

  test("сохранение строкового представления action функции", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actionFn = ({ context }: any) => context.foo + context.bar
    const actions: ProcessesDeclaration<typeof schema, "sourceTest", {}> = (process) => ({
      sourceTest: process().action(actionFn),
    })
    const snapshot = processesSchema(actions)

    expect((snapshot?.sourceTest as any)?.action?.src, "сохранено строковое представление action").toBe(
      actionFn.toString()
    )
    expect((snapshot?.sourceTest as any)?.action?.read, "прочитаны поля контекста").toEqual(["foo", "bar"])
  })

  test("сохранение строкового представления всех обработчиков", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actionFn = ({ context }: any) => context.foo
    const successFn = ({ update, data }: any) => update({ result: data })
    const errorFn = ({ update, error }: any) => update({ error: error.message })

    const actions: ProcessesDeclaration<typeof schema, "allHandlersTest", {}> = (process) => ({
      allHandlersTest: process().action(actionFn).success(successFn).error(errorFn),
    })
    const snapshot = processesSchema(actions)

    expect((snapshot?.allHandlersTest as any)?.action?.src, "сохранено строковое представление action").toBe(
      actionFn.toString()
    )
    expect((snapshot?.allHandlersTest as any)?.success?.src, "сохранено строковое представление success").toContain(
      successFn.toString().replace(/\}\)$/, "")
    )
    expect((snapshot?.allHandlersTest as any)?.error?.src, "сохранено строковое представление error").toContain(
      errorFn.toString().replace(/\}\)$/, "")
    )
  })
})

describe("parseChain — несколько chain", () => {
  test("корректно парсит объект с несколькими chain", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => ({
      first: process({ label: "Первый процесс", desc: "Обрабатывает foo" })
        .action(({ context }) => ({ foo: context.foo }))
        .success(({ update, data }) => update({ foo: data.foo })),
      second: process({ label: "Второй процесс", desc: "Обрабатывает bar" })
        .action(({ context }) => ({ bar: context.bar }))
        .error(({ update, error }) => update({ bar: 42 })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "first": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ context }) => ({ foo: context.foo })",
          },
          "desc": "Обрабатывает foo",
          "label": "Первый процесс",
          "success": {
            "src": "({ update, data }) => update({ foo: data.foo }, "s")",
            "write": [
              "foo",
            ],
          },
          "type": "action",
        },
        "second": {
          "action": {
            "read": [
              "bar",
            ],
            "src": "({ context }) => ({ bar: context.bar })",
          },
          "desc": "Обрабатывает bar",
          "error": {
            "src": "({ update, error }) => update({ bar: 42 }, "e")",
            "write": [
              "bar",
            ],
          },
          "label": "Второй процесс",
          "type": "action",
        },
      }
    `)
  })

  test("смешанные типы процессов", () => {
    const schema = contextSchema((t) => ({ foo: t.string.required("a"), bar: t.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "simple" | "complex" | "async", {}> = (process) => ({
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
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "async": {
          "action": {
            "read": [
              "foo",
            ],
            "src": Any<String>,
          },
          "type": "action",
        },
        "complex": {
          "action": {
            "read": [
              "foo",
              "bar",
            ],
            "src": Any<String>,
          },
          "error": {
            "src": Any<String>,
            "write": [
              "bar",
            ],
          },
          "success": {
            "src": Any<String>,
            "write": [
              "foo",
            ],
          },
          "type": "action",
        },
        "simple": {
          "action": {
            "read": [
              "foo",
            ],
            "src": Any<String>,
          },
          "type": "action",
        },
      }
    `)
  })

  test("destroy процессы", () => {
    const schema = contextSchema((t) => ({
      foo: t.string.required("a"),
      bar: t.number.required(0),
      cleanup: t.boolean.required(false),
    }))

    const actions: ProcessesDeclaration<
      typeof schema,
      "cleanup" | "finalize" | "simple" | "nonRecursive",
      { cleanup: boolean; bar: number }
    > = (process, destroy) => ({
      cleanup: destroy({ label: "Очистка ресурсов", desc: "Удаляет временные данные" }).before(({ core }) => {
        // Очистка временных данных
        core.cleanup = true
      }),
      finalize: destroy({ label: "Финализация", recursive: true }).before(({ core }) => {
        // Финальная обработка
        core.bar = 999
      }),
      simple: destroy({ label: "Простое удаление" }),
      nonRecursive: destroy({ label: "Не рекурсивное удаление", recursive: false }).before(({ core }) => {
        // Обработка без рекурсии
        core.bar = 0
      }),
    })

    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "cleanup": {
          "before": {
            "src": 
      "({ core }) => {
              core.cleanup = !0;
            }"
      ,
          },
          "desc": "Удаляет временные данные",
          "label": "Очистка ресурсов",
          "type": "finally",
        },
        "finalize": {
          "before": {
            "src": 
      "({ core }) => {
              core.bar = 999;
            }"
      ,
          },
          "label": "Финализация",
          "recursive": true,
          "type": "finally",
        },
        "nonRecursive": {
          "before": {
            "src": 
      "({ core }) => {
              core.bar = 0;
            }"
      ,
          },
          "label": "Не рекурсивное удаление",
          "type": "finally",
        },
        "simple": {
          "before": {
            "src": "() => {}",
          },
          "label": "Простое удаление",
          "type": "finally",
        },
      }
    `)
  })
})
