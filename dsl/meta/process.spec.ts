import { test, describe, expect } from "bun:test"
import { processesSchema } from "./process.js"
import { contextSchema } from "@zavx0z/context"
import type { ProcessesDeclaration } from "./process.t.js"

describe("ESM-процессы", () => {
  describe("Валидная структура action", () => {
    test("процесс с import и return", () => {
      const schema = contextSchema((field) => ({
        foo: field.string.required("a"),
        bar: field.number.required(0),
      }))

      const actions: ProcessesDeclaration<typeof schema, "valid", {}> = (process) => ({
        valid: process()
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const mod = await import("./mock-action.ts")
            return mod.default(value)
          })
          .success(({ update, data }) => update({ foo: data }))
          .error(({ update, error }) => update({ bar: 1 })),
      })

      const snapshot = processesSchema(actions)
      expect(snapshot.valid).toBeDefined()
      expect((snapshot.valid as any).action.src).toBe("./mock-action.ts")
      expect((snapshot.valid as any).success.src).toContain("update({ foo: data }")
      expect((snapshot.valid as any).error.src).toContain("update({ bar: 1 }")
    })

    test("процесс с конфигурацией env", () => {
      const schema = contextSchema((field) => ({
        data: field.string.required(""),
      }))

      const actions: ProcessesDeclaration<typeof schema, "withEnv", {}> = (process) => ({
        withEnv: process({
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
      })

      const snapshot = processesSchema(actions)
      expect(snapshot.withEnv).toBeDefined()
      expect((snapshot.withEnv as any).action.src).toBe("./actions/loader.ts")
      expect(snapshot.withEnv!.label).toBe("env_process")
      expect(snapshot.withEnv!.desc).toBe("Процесс с конфигурацией окружения")
      expect(snapshot.withEnv!.env).toEqual(["browser", "node"])
    })

    test("несколько процессов с разными модулями", () => {
      const schema = contextSchema((field) => ({
        url: field.string.required(""),
        id: field.number.required(0),
      }))

      const actions: ProcessesDeclaration<typeof schema, "load" | "save", {}> = (process) => ({
        load: process({ label: "Загрузка данных" })
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const loader = await import("./actions/loader.ts")
            return loader.default({ value })
          })
          .success(({ update, data }) => update({ url: data.url })),
        save: process({ label: "Сохранение данных" })
          .action(async ({ value }) => {
            // @ts-expect-error — тестовый импорт
            const saver = await import("./actions/saver.ts")
            return saver.default({ value })
          })
          .error(({ update, error }) => update({ id: 0 })),
      })

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
      const schema = contextSchema((field) => ({
        foo: field.string.required("a"),
      }))

      const actions: ProcessesDeclaration<typeof schema, "invalid", {}> = (process) => ({
        invalid: process().action(({ value }) => value.foo),
      })

      expect(() => processesSchema(actions)).toThrow("Невалидная структура action")
    })

    test("ошибка при отсутствии return", () => {
      const schema = contextSchema((field) => ({
        foo: field.string.required("a"),
      }))

      const actions: ProcessesDeclaration<typeof schema, "invalid", {}> = (process) => ({
        invalid: process().action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock.ts")
          mod.process(value)
          // Нет return
        }),
      })

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

  describe("destroy-процессы с env", () => {
    test("destroy с конфигурацией env", () => {
      const schema = contextSchema((field) => ({
        cleanup: field.boolean.required(false),
      }))

      const actions: ProcessesDeclaration<typeof schema, "cleanup", { cleanup: boolean }> = (
        process,
        destroy
      ) => ({
        cleanup: destroy({
          label: "Очистка",
          desc: "Очистка ресурсов",
          env: ["node", "worker"],
        }).before(({ mass }) => {
          mass.cleanup = true
        }),
      })

      const snapshot = processesSchema(actions)
      expect(snapshot.cleanup).toBeDefined()
      expect((snapshot.cleanup!.type as string)).toBe("finally")
      expect(snapshot.cleanup!.label).toBe("Очистка")
      expect(snapshot.cleanup!.desc).toBe("Очистка ресурсов")
      expect(snapshot.cleanup!.env).toEqual(["node", "worker"])
      expect((snapshot.cleanup as any).before.src).toContain("mass.cleanup = true")
    })
  })
})

describe("parseChainsObject — ESM actions", () => {
  test("action, success, error варианты", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    type C = typeof schema
    type S = "onlyAction" | "onlySuccess" | "onlyError" | "allHandlers"

    const actions: ProcessesDeclaration<C, S, {}> = (process) => ({
      onlyAction: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value)
      }),
      onlySuccess: process()
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(({ update, data }) => update({ foo: data })),
      onlyError: process()
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .error(({ update, error }) => update({ bar: 1 })),
      allHandlers: process()
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 2 })),
    })
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

  test("пустой объект", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, never, {}> = (process) => ({})
    const snapshot = processesSchema(actions)
    expect(snapshot, "пустой объект возвращает пустой объект").toEqual({})
  })

  test("один процесс", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "single", {}> = (process) => ({
      single: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value)
      }),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot.single).toBeDefined()
    expect((snapshot.single!.type as string)).toBe("action")
    expect((snapshot.single as any).action.src).toBe("./mock-action.ts")
  })

  test("несколько процессов", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => ({
      first: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.foo)
      }),
      second: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.bar)
      }),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot.first).toBeDefined()
    expect(snapshot.second).toBeDefined()
    expect((snapshot.first as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.second as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.first as any).action.read).toEqual(["foo"])
    expect((snapshot.second as any).action.read).toEqual(["bar"])
  })

  test("процессы с разными типами возвращаемых значений", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "string" | "number" | "object", {}> = (process) => ({
      string: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.foo)
      }),
      number: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.bar)
      }),
      object: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default({ foo: value.foo, bar: value.bar })
      }),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot.string).toBeDefined()
    expect(snapshot.number).toBeDefined()
    expect(snapshot.object).toBeDefined()
    expect((snapshot.string as any).action.read).toEqual(["foo"])
    expect((snapshot.number as any).action.read).toEqual(["bar"])
    expect((snapshot.object as any).action.read).toEqual(["foo", "bar"])
  })

  test("процессы с async функциями и разными модулями", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "async", {}> = (process) => ({
      async: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/loader.ts")
        return mod.default(value)
      }),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot.async).toBeDefined()
    expect((snapshot.async as any).action.src).toBe("./actions/loader.ts")
  })

  test("процессы с success и error обработчиками", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "withHandlers", {}> = (process) => ({
      withHandlers: process()
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(({ update, data }) => update({ foo: data }))
        .error(({ update, error }) => update({ bar: 42 })),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot.withHandlers).toBeDefined()
    expect((snapshot.withHandlers as any).action.src).toBe("./mock-action.ts")
    expect((snapshot.withHandlers as any).success.src).toContain("update({ foo: data }")
    expect((snapshot.withHandlers as any).error.src).toContain("update({ bar: 42 }")
  })

  test("процессы с label и desc", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a") }))
    const actions: ProcessesDeclaration<typeof schema, "withMeta", {}> = (process) => ({
      withMeta: process({ label: "test_process", desc: "Test process description" }).action(
        async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        }
      ),
    })
    const snapshot = processesSchema(actions)
    expect(snapshot.withMeta).toBeDefined()
    expect(snapshot.withMeta!.label).toBe("test_process")
    expect(snapshot.withMeta!.desc).toBe("Test process description")
    expect((snapshot.withMeta as any).action.src).toBe("./mock-action.ts")
  })

  test("извлечение пути модуля из action", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "moduleTest", {}> = (process) => ({
      moduleTest: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/processor.ts")
        return mod.default(value)
      }),
    })
    const snapshot = processesSchema(actions)
    expect((snapshot?.moduleTest as any)?.action?.src, "путь к модулю извлечён").toBe("./actions/processor.ts")
  })

  test("сохранение строкового представления success/error обработчиков", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const successFn = ({ update, data }: any) => update({ result: data })
    const errorFn = ({ update, error }: any) => update({ error: error.message })

    const actions: ProcessesDeclaration<typeof schema, "allHandlersTest", {}> = (process) => ({
      allHandlersTest: process()
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        })
        .success(successFn)
        .error(errorFn),
    })
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
  test("корректно парсит объект с несколькими chain", () => {
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "first" | "second", {}> = (process) => ({
      first: process({ label: "Первый процесс", desc: "Обрабатывает foo" })
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./actions/loader.ts")
          return mod.default({ foo: value.foo })
        })
        .success(({ update, data }) => update({ foo: data.foo })),
      second: process({ label: "Второй процесс", desc: "Обрабатывает bar" })
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./actions/saver.ts")
          return mod.default({ bar: value.bar })
        })
        .error(({ update, error }) => update({ bar: 42 })),
    })
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
    const schema = contextSchema((field) => ({ foo: field.string.required("a"), bar: field.number.required(0) }))
    const actions: ProcessesDeclaration<typeof schema, "simple" | "complex" | "async", {}> = (process) => ({
      simple: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mock-action.ts")
        return mod.default(value.foo)
      }),
      complex: process()
        .action(async ({ value }) => {
          // @ts-expect-error — тестовый импорт
          const mod = await import("./actions/processor.ts")
          return mod.default({ foo: value.foo, bar: value.bar })
        })
        .success(({ update, data }) => update({ foo: data.foo }))
        .error(({ update, error }) => update({ bar: 0 })),
      async: process().action(async ({ value }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/loader.ts")
        return mod.default(value)
      }),
    })
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
        mass.cleanup = true
      }),
      finalize: destroy({ label: "Финализация" }).before(({ mass }) => {
        mass.bar = 999
      }),
      simple: destroy({ label: "Простое удаление" }),
      nonRecursive: destroy({ label: "Не рекурсивное удаление" }).before(({ mass }) => {
        mass.bar = 0
      }),
    })

    const snapshot = processesSchema(actions)

    expect(snapshot.cleanup).toBeDefined()
    expect((snapshot.cleanup!.type as string)).toBe("finally")
    expect(snapshot.cleanup!.label).toBe("Очистка ресурсов")
    expect(snapshot.cleanup!.desc).toBe("Удаляет временные данные")
    expect((snapshot.cleanup as any).before.src).toContain("mass.cleanup = true")

    expect(snapshot.finalize).toBeDefined()
    expect((snapshot.finalize!.type as string)).toBe("finally")
    expect(snapshot.finalize!.label).toBe("Финализация")
    expect((snapshot.finalize as any).before.src).toContain("mass.bar = 999")

    expect(snapshot.simple).toBeDefined()
    expect((snapshot.simple!.type as string)).toBe("finally")
    expect(snapshot.simple!.label).toBe("Простое удаление")

    expect(snapshot.nonRecursive).toBeDefined()
    expect((snapshot.nonRecursive!.type as string)).toBe("finally")
    expect(snapshot.nonRecursive!.label).toBe("Не рекурсивное удаление")
    expect((snapshot.nonRecursive as any).before.src).toContain("mass.bar = 0")
  })
})
