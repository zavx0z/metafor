import { test, describe, expect } from "bun:test"
import { processesSchema } from "./process.js"
import { fieldSchema } from "./fields.ts"
import type { ProcessesDeclaration } from "@metafor/types/metafor/process"

describe("ESM-процессы", () => {
  describe("Валидная структура action", () => {
    test("процесс в массиве с явной superposition", () => {
      const schema = fieldSchema((field) => ({
        foo: field.string.required("a"),
        bar: field.number.required(0),
      }))

      const actions: ProcessesDeclaration<typeof schema, "ready", {}> = (process) => [
        process("ready", { label: "array_process", env: ["any"] })
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const mod = await import("./mock-action.ts")
            return mod.default(value.foo)
          })
          .success(({ update, data }) => update({ foo: data })),
      ]

      const snapshot = processesSchema(actions)
      expect(snapshot.ready).toBeDefined()
      expect((snapshot.ready as any).action.src).toBe("./mock-action.ts")
      expect(snapshot.ready!.label).toBe("array_process")
      expect(snapshot.ready!.env).toEqual(["any"])
    })

    test("процесс с import и return", () => {
      const schema = fieldSchema((field) => ({
        foo: field.string.required("a"),
        bar: field.number.required(0),
      }))

      const actions: ProcessesDeclaration<typeof schema, "valid", {}> = (process) => [
        process("valid")
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const mod = await import("./mock-action.ts")
            return mod.default(value)
          })
          .success(({ update, data }) => update({ foo: data }))
          .error(({ update, error }) => update({ bar: 1 })),
      ]

      const snapshot = processesSchema(actions)
      expect(snapshot.valid).toBeDefined()
      expect((snapshot.valid as any).action.src).toBe("./mock-action.ts")
      expect((snapshot.valid as any).success.src).toContain("update({ foo: data }")
      expect((snapshot.valid as any).error.src).toContain("update({ bar: 1 }")
    })

    test("процесс с конфигурацией env", () => {
      const schema = fieldSchema((field) => ({
        data: field.string.required(""),
      }))

      const actions: ProcessesDeclaration<typeof schema, "withEnv", {}> = (process) => [
        process("withEnv", {
          label: "env_process",
          desc: "Процесс с конфигурацией окружения",
          env: ["browser", "node"],
        })
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const mod = await import("./actions/loader.ts")
            return mod.default({ value })
          })
          .success(({ update, data }) => update({ data: data })),
      ]

      const snapshot = processesSchema(actions)
      expect(snapshot.withEnv).toBeDefined()
      expect((snapshot.withEnv as any).action.src).toBe("./actions/loader.ts")
      expect(snapshot.withEnv!.label).toBe("env_process")
      expect(snapshot.withEnv!.desc).toBe("Процесс с конфигурацией окружения")
      expect(snapshot.withEnv!.env).toEqual(["browser", "node"])
    })

    test("несколько процессов с разными модулями", () => {
      const schema = fieldSchema((field) => ({
        url: field.string.required(""),
        id: field.number.required(0),
      }))

      const actions: ProcessesDeclaration<typeof schema, "load" | "save", {}> = (process) => [
        process("load", { label: "Загрузка данных" })
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const loader = await import("./actions/loader.ts")
            return loader.default({ value })
          })
          .success(({ update, data }) => update({ url: data.url })),
        process("save", { label: "Сохранение данных" })
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const saver = await import("./actions/saver.ts")
            return saver.default({ value })
          })
          .error(({ update, error }) => update({ id: 0 })),
      ]

      const snapshot = processesSchema(actions)
      expect(snapshot.load).toBeDefined()
      expect(snapshot.save).toBeDefined()
      expect((snapshot.load as any).action.src).toBe("./actions/loader.ts")
      expect((snapshot.save as any).action.src).toBe("./actions/saver.ts")
      expect(snapshot.load!.label).toBe("Загрузка данных")
      expect(snapshot.save!.label).toBe("Сохранение данных")
    })
  })

  describe("Невалидная структура action", () => {
    test("ошибка при отсутствии import", () => {
      const schema = fieldSchema((field) => ({
        foo: field.string.required("a"),
      }))

      const actions: ProcessesDeclaration<typeof schema, "invalid", {}> = (process) => [
        process("invalid").action(({ value }) => value.foo),
      ]

      expect(() => processesSchema(actions)).toThrow("Невалидная структура action")
    })

    test("ошибка при отсутствии return", () => {
      const schema = fieldSchema((field) => ({
        foo: field.string.required("a"),
      }))

      const actions: ProcessesDeclaration<typeof schema, "invalid", {}> = (process) => [
        process("invalid").action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock.ts")
          mod.process(value)
          // Нет return
        }),
      ]

      expect(() => processesSchema(actions)).toThrow("Невалидная структура action")
    })
  })

  describe("extractModuleSrc", () => {
    test("извлечение пути из async import", () => {
      const fn = async ({ value }: { value: unknown }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/loader.ts")
        return mod.default(value)
      }

      const code = fn.toString()
      const match = /import\s*\(\s*["']([^"']+)["']\s*\)/.exec(code)
      expect(match?.[1]).toBe("./actions/loader.ts")
    })
  })

})

describe("parseChainsArray — ESM actions", () => {
  test("action, success, error варианты", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    type C = typeof schema
    type S = "onlyAction" | "onlySuccess" | "onlyError" | "allHandlers"

    const actions: ProcessesDeclaration<C, S, {}> = (process) => [
      process("onlyAction").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value)
      }),
      process("onlySuccess")
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(({ update, data }) => update({ foo: data })),
      process("onlyError")
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .error(({ update, error }) => update({ bar: 1 })),
      process("allHandlers")
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 2 })),
    ]
    const snapshot = processesSchema(actions)

    expect(snapshot.onlyAction).toBeDefined()
    expect((snapshot.onlyAction!.type as string)).toBe("action")
    expect((snapshot.onlyAction as any).action.src).toBe("./mock-action.ts")

    expect(snapshot.onlySuccess).toBeDefined()
    expect((snapshot.onlySuccess as any).success.src).toContain("update({ foo: data }")

    expect(snapshot.onlyError).toBeDefined()
    expect((snapshot.onlyError as any).error.src).toContain("update({ bar: 1 }")

    expect(snapshot.allHandlers).toBeDefined()
    expect((snapshot.allHandlers as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.allHandlers as any).success.src).toContain("update({ foo: data }")
    expect((snapshot.allHandlers as any).error.src).toContain("update({ bar: 2 }")
  })

  test("пустой массив", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, never, {}> = () => []
    const snapshot = processesSchema(actions)
    expect(snapshot, "пустой массив возвращает пустую схему").toEqual({})
  })

  test("один процесс", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "single", {}> = (process) => [
      process("single").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value)
      }),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.single).toBeDefined()
    expect((snapshot.single!.type as string)).toBe("action")
    expect((snapshot.single as any).action.src).toBe("./mock-action.ts")
  })

  test("несколько процессов", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => [
      process("first").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.foo)
      }),
      process("second").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.bar)
      }),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.first).toBeDefined()
    expect(snapshot.second).toBeDefined()
    expect((snapshot.first as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.second as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.first as any).action.read).toEqual(["foo"])
    expect((snapshot.second as any).action.read).toEqual(["bar"])
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "string" | "number" | "object", {}> = (process) => [
      process("string").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.foo)
      }),
      process("number").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.bar)
      }),
      process("object").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default({ foo: value.foo, bar: value.bar })
      }),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.string).toBeDefined()
    expect(snapshot.number).toBeDefined()
    expect(snapshot.object).toBeDefined()
    expect((snapshot.string as any).action.read).toEqual(["foo"])
    expect((snapshot.number as any).action.read).toEqual(["bar"])
    expect((snapshot.object as any).action.read).toEqual(["foo", "bar"])
  })

  test("процессы с async функциями и разными модулями", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "async", {}> = (process) => [
      process("async").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/loader.ts")
        return mod.default(value)
      }),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.async).toBeDefined()
    expect((snapshot.async as any).action.src).toBe("./actions/loader.ts")
  })

  test("процессы с success и error обработчиками", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "withHandlers", {}> = (process) => [
      process("withHandlers")
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 42 })),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.withHandlers).toBeDefined()
    expect((snapshot.withHandlers as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.withHandlers as any).success.src).toContain("update({ foo: data }")
    expect((snapshot.withHandlers as any).error.src).toContain("update({ bar: 42 }")
  })

  test("процессы с label и desc", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "withMeta", {}> = (process) => [
      process("withMeta", { label: "test_process", desc: "Test process description" }).action(
        async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        }
      ),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.withMeta).toBeDefined()
    expect(snapshot.withMeta!.label).toBe("test_process")
    expect(snapshot.withMeta!.desc).toBe("Test process description")
    expect((snapshot.withMeta as any).action.src).toBe("./mock-action.ts")
  })

  test("извлечение пути модуля из action", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "moduleTest", {}> = (process) => [
      process("moduleTest").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/processor.ts")
        return mod.default(value)
      }),
    ]
    const snapshot = processesSchema(actions)
    expect((snapshot?.moduleTest as any)?.action?.src, "путь к модулю извлечён").toBe("./actions/processor.ts")
  })

  test("сохранение строкового представления success/error обработчиков", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const successFn = ({ update, data }: any) => update({ result: data })
    const errorFn = ({ update, error }: any) => update({ error: error.message })

    const actions: ProcessesDeclaration<typeof schema, "allHandlersTest", {}> = (process) => [
      process("allHandlersTest")
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(successFn)
        .error(errorFn),
    ]
    const snapshot = processesSchema(actions)

    expect((snapshot?.allHandlersTest as any)?.action?.src, "путь к модулю action").toBe("./mock-action.ts")
    expect((snapshot?.allHandlersTest as any)?.success?.src, "сохранено строковое представление success").toContain(
      successFn.toString().replace(/\}\)$/, "")
    )
    expect((snapshot?.allHandlersTest as any)?.error?.src, "сохранено строковое представление error").toContain(
      errorFn.toString().replace(/\}\)$/, "")
    )
  })
})

describe("parseChain — несколько chain", () => {
  test("корректно парсит массив с несколькими chain", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => [
      process("first", { label: "Первый процесс", desc: "Обрабатывает foo" })
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./actions/loader.ts")
          return mod.default({ foo: value.foo })
        })
        .success(({ update, data }) => update({ foo: data.foo })),
      process("second", { label: "Второй процесс", desc: "Обрабатывает bar" })
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./actions/saver.ts")
          return mod.default({ bar: value.bar })
        })
        .error(({ update, error }) => update({ bar: 42 })),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.first).toBeDefined()
    expect(snapshot.second).toBeDefined()
    expect(snapshot.first!.label).toBe("Первый процесс")
    expect(snapshot.first!.desc).toBe("Обрабатывает foo")
    expect((snapshot.first as any).action.src).toBe("./actions/loader.ts")
    expect(snapshot.second!.label).toBe("Второй процесс")
    expect(snapshot.second!.desc).toBe("Обрабатывает bar")
    expect((snapshot.second as any).action.src).toBe("./actions/saver.ts")
  })

  test("смешанные типы процессов", () => {
    const schema = fieldSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "simple" | "complex" | "async", {}> = (process) => [
      process("simple").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.foo)
      }),
      process("complex")
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./actions/processor.ts")
          return mod.default({ foo: value.foo, bar: value.bar })
        })
        .success(({ update, data }) => update({ foo: data.foo }))
        .error(({ update, error }) => update({ bar: 0 })),
      process("async").action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/loader.ts")
        return mod.default(value)
      }),
    ]
    const snapshot = processesSchema(actions)
    expect(snapshot.simple).toBeDefined()
    expect(snapshot.complex).toBeDefined()
    expect(snapshot.async).toBeDefined()
    expect((snapshot.simple as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.complex as any).action.src).toBe("./actions/processor.ts")
    expect((snapshot.async as any).action.src).toBe("./actions/loader.ts")
    expect((snapshot.complex as any).success).toBeDefined()
    expect((snapshot.complex as any).error).toBeDefined()
  })
})
