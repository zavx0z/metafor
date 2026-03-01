import { test, describe, expect } from "bun:test"
import { processesSchema } from "./process.js"
import { contextSchema } from "@zavx0z/context"
import type { ProcessesDeclaration } from "./process.t.js"

describe("parseChainsObject — разные варианты chain", () => {
  test("action, success, error варианты", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    type C = typeof schema
    type S = "onlyAction" | "onlySuccess" | "onlyError" | "allHandlers"

    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      onlyAction: process().action(({ fields }) => fields.foo),
      onlySuccess: process()
        .action(({ fields }) => fields.foo)
        .success(({ update, data }) => update({ foo: data })),
      onlyError: process()
        .action(({ fields }) => fields.foo)
        .error(({ update, error }) => update({ bar: 1 })),
      allHandlers: process()
        .action(({ fields }) => fields.foo)
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
            "src": "({ fields }) => fields.foo",
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
            "src": "({ fields }) => fields.foo",
          },
          "type": "action",
        },
        "onlyError": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ fields }) => fields.foo",
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
            "src": "({ fields }) => fields.foo",
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
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, never, {}> = (process) => ({})
    const snapshot = processesSchema(actions)
    expect(snapshot, "пустой объект возвращает пустой объект").toEqual({})
  })

  test("один процесс", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "single", {}> = (process) => ({
      single: process().action(({ fields }) => fields.foo),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "single": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ fields }) => fields.foo",
          },
          "type": "action",
        },
      }
    `)
  })

  test("несколько процессов", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => ({
      first: process().action(({ fields }) => fields.foo),
      second: process().action(({ fields }) => fields.bar),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "first": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ fields }) => fields.foo",
          },
          "type": "action",
        },
        "second": {
          "action": {
            "read": [
              "bar",
            ],
            "src": "({ fields }) => fields.bar",
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "string" | "number" | "object", {}> = (process) => ({
      string: process().action(({ fields }) => fields.foo),
      number: process().action(({ fields }) => fields.bar),
      object: process().action(({ fields }) => ({ foo: fields.foo, bar: fields.bar })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "number": {
          "action": {
            "read": [
              "bar",
            ],
            "src": "({ fields }) => fields.bar",
          },
          "type": "action",
        },
        "object": {
          "action": {
            "read": [
              "foo",
              "bar",
            ],
            "src": "({ fields }) => ({ foo: fields.foo, bar: fields.bar })",
          },
          "type": "action",
        },
        "string": {
          "action": {
            "read": [
              "foo",
            ],
            "src": "({ fields }) => fields.foo",
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с async функциями", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "async", {}> = (process) => ({
      async: process().action(async ({ fields }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return fields.foo
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
      "async ({ fields }) => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              return fields.foo;
            }"
      ,
          },
          "type": "action",
        },
      }
    `)
  })

  test("процессы с success и error обработчиками", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "withHandlers", {}> = (process) => ({
      withHandlers: process()
        .action(({ fields }) => fields.foo)
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
            "src": "({ fields }) => fields.foo",
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
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "withMeta", {}> = (process) => ({
      withMeta: process({ label: "test_process", desc: "Test process description" }).action(
        ({ fields }) => fields.foo
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
            "src": "({ fields }) => fields.foo",
          },
          "desc": "Test process description",
          "label": "test_process",
          "type": "action",
        },
      }
    `)
  })

  test("сохранение строкового представления action функции", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actionFn = ({ fields }: any) => fields.foo + fields.bar
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
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actionFn = ({ fields }: any) => fields.foo
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
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => ({
      first: process({ label: "Первый процесс", desc: "Обрабатывает foo" })
        .action(({ fields }) => ({ foo: fields.foo }))
        .success(({ update, data }) => update({ foo: data.foo })),
      second: process({ label: "Второй процесс", desc: "Обрабатывает bar" })
        .action(({ fields }) => ({ bar: fields.bar }))
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
            "src": "({ fields }) => ({ foo: fields.foo })",
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
            "src": "({ fields }) => ({ bar: fields.bar })",
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
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "simple" | "complex" | "async", {}> = (process) => ({
      simple: process().action(({ fields }) => fields.foo),
      complex: process()
        .action(({ fields }) => ({ foo: fields.foo, bar: fields.bar }))
        .success(({ update, data }) => update({ foo: data.foo }))
        .error(({ update, error }) => update({ bar: 0 })),
      async: process().action(async ({ fields }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return fields.foo
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
      "async ({ fields }) => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              return fields.foo;
            }"
      ,
          },
          "type": "action",
        },
        "complex": {
          "action": {
            "read": [
              "foo",
              "bar",
            ],
            "src": "({ fields }) => ({ foo: fields.foo, bar: fields.bar })",
          },
          "error": {
            "src": "({ update, error }) => update({ bar: 0 }, "e")",
            "write": [
              "bar",
            ],
          },
          "success": {
            "src": "({ update, data }) => update({ foo: data.foo }, "s")",
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
            "src": "({ fields }) => fields.foo",
          },
          "type": "action",
        },
      }
    `)
  })

  test("destroy процессы", () => {
    const schema = contextSchema((field) => ({
      foo: field.string.required("a"),
      bar: field.number.required(0),
      cleanup: field.boolean.required(false),
    }))

    const actions: ProcessesDeclaration<
      typeof schema,
      "cleanup" | "finalize" | "simple" | "nonRecursive",
      { cleanup: boolean; bar: number }
    > = (process, destroy) => ({
      cleanup: destroy({ label: "Очистка ресурсов", desc: "Удаляет временные данные" }).before(({ mass }) => {
        // Очистка временных данных
        mass.cleanup = true
      }),
      finalize: destroy({ label: "Финализация" }).before(({ mass }) => {
        // Финальная обработка
        mass.bar = 999
      }),
      simple: destroy({ label: "Простое удаление" }),
      nonRecursive: destroy({ label: "Не рекурсивное удаление" }).before(({ mass }) => {
        // Обработка без рекурсии
        mass.bar = 0
      }),
    })

    const snapshot = processesSchema(actions)
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "cleanup": {
          "before": {
            "src": 
      "({ mass }) => {
              mass.cleanup = true;
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
      "({ mass }) => {
              mass.bar = 999;
            }"
      ,
          },
          "label": "Финализация",
          "type": "finally",
        },
        "nonRecursive": {
          "before": {
            "src": 
      "({ mass }) => {
              mass.bar = 0;
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
