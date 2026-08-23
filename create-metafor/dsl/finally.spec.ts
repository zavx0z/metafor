import { describe, expect, test } from "bun:test"
import { parseFinally } from "./finally.ts"
import { fieldSchema } from "./fields.ts"
import { processesSchema } from "./process.js"
import type { ProcessesDeclaration } from "@metafor/types/metafor/process"

describe("finally-процессы", () => {
  test("destroy в массиве с явной superposition", () => {
    const schema = fieldSchema((field) => ({
      cleanup: field.boolean.required(false),
    }))

    const actions: ProcessesDeclaration<typeof schema, "cleanup", { cleanup: boolean }> = (process, destroy) => [
      destroy("cleanup", {
        label: "Очистка",
        desc: "Очистка ресурсов",
        env: ["node"],
      }).before(async ({ mass, energy }) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      }),
    ]

    const snapshot = processesSchema(actions)
    expect(snapshot.cleanup).toBeDefined()
    expect((snapshot.cleanup!.type as string)).toBe("finally")
    expect(snapshot.cleanup!.label).toBe("Очистка")
    expect(snapshot.cleanup!.env).toEqual(["node"])
  })

  test("destroy с конфигурацией env", () => {
    const schema = fieldSchema((field) => ({
      cleanup: field.boolean.required(false),
    }))

    const actions: ProcessesDeclaration<typeof schema, "cleanup", { cleanup: boolean }> = (process, destroy) => [
      destroy("cleanup", {
        label: "Очистка",
        desc: "Очистка ресурсов",
        env: ["node", "worker"],
      }).before(async ({ mass, energy }) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      }),
    ]

    const snapshot = processesSchema(actions)
    expect(snapshot.cleanup).toBeDefined()
    expect((snapshot.cleanup!.type as string)).toBe("finally")
    expect(snapshot.cleanup!.label).toBe("Очистка")
    expect(snapshot.cleanup!.desc).toBe("Очистка ресурсов")
    expect(snapshot.cleanup!.env).toEqual(["node", "worker"])
    expect((snapshot.cleanup as { before: { src: string } }).before.src).toContain("import(\"./tests/types/fixtures/finally-cleanup.ts\")")
  })

  test("несколько destroy процессов", () => {
    const schema = fieldSchema((field) => ({
      foo: field.string.required("a"),
      bar: field.number.required(0),
      cleanup: field.boolean.required(false),
    }))

    const actions: ProcessesDeclaration<
      typeof schema,
      "cleanup" | "finalize" | "simple" | "nonRecursive",
      { cleanup: boolean; bar: number }
    > = (process, destroy) => [
      destroy("cleanup", { label: "Очистка ресурсов", desc: "Удаляет временные данные" }).before(async ({ mass, energy }) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      }),
      destroy("finalize", { label: "Финализация" }).before(async ({ mass, energy }) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      }),
      destroy("simple", { label: "Простое удаление" }),
      destroy("nonRecursive", { label: "Не рекурсивное удаление" }).before(async ({ mass, energy }) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      }),
    ]

    const snapshot = processesSchema(actions)

    expect(snapshot.cleanup).toBeDefined()
    expect((snapshot.cleanup!.type as string)).toBe("finally")
    expect(snapshot.cleanup!.label).toBe("Очистка ресурсов")
    expect(snapshot.cleanup!.desc).toBe("Удаляет временные данные")
    expect((snapshot.cleanup as { before: { src: string } }).before.src).toContain("finally-cleanup.ts")

    expect(snapshot.finalize).toBeDefined()
    expect((snapshot.finalize!.type as string)).toBe("finally")
    expect(snapshot.finalize!.label).toBe("Финализация")
    expect((snapshot.finalize as { before: { src: string } }).before.src).toContain("finally-cleanup.ts")

    expect(snapshot.simple).toBeDefined()
    expect((snapshot.simple!.type as string)).toBe("finally")
    expect(snapshot.simple!.label).toBe("Простое удаление")

    expect(snapshot.nonRecursive).toBeDefined()
    expect((snapshot.nonRecursive!.type as string)).toBe("finally")
    expect(snapshot.nonRecursive!.label).toBe("Не рекурсивное удаление")
    expect((snapshot.nonRecursive as { before: { src: string } }).before.src).toContain("finally-cleanup.ts")
  })

  test("parseFinally нормализует before handler", () => {
    const parsed = parseFinally<{ cleanup: boolean }>({
      type: "finally",
      label: "Cleanup",
      desc: "before hook",
      env: ["node"],
      before: async ({ mass, energy }) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      },
    })

    expect(parsed).toEqual({
      type: "finally",
      label: "Cleanup",
      desc: "before hook",
      env: ["node"],
      before: {
        src: expect.stringContaining("finally-cleanup.ts"),
      },
    })
  })

  test("destroy.before отклоняет inline cleanup-логику", () => {
    expect(() => parseFinally<{cleanup: boolean}>({
      type: "finally",
      before: ({mass}) => {
        mass.cleanup = true
      },
    })).toThrow("destroy.before")
  })

  test("destroy.before отклоняет import без возврата результата cleanup-модуля", () => {
    expect(() => parseFinally<{cleanup: boolean}>({
      type: "finally",
      before: async ({mass, energy}) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        void cleanup.release({mass, energy})
      },
    })).toThrow("destroy.before")
  })

  test("destroy.before отклоняет пустую inline-заглушку", () => {
    expect(() => parseFinally({
      type: "finally",
      before: () => {},
    })).toThrow("destroy.before")
  })

  test("destroy.before отклоняет cleanup-логику рядом с import", () => {
    expect(() => parseFinally<{cleanup: boolean}>({
      type: "finally",
      before: async ({mass, energy}) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        mass.cleanup = true
        return cleanup.release({mass, energy})
      },
    })).toThrow("destroy.before")
  })

  test("destroy.before отклоняет мутацию внутри аргумента cleanup-вызова", () => {
    expect(() => parseFinally<{cleanup: boolean}>({
      type: "finally",
      before: async ({mass, energy}) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release((mass.cleanup = true, {mass, energy}))
      },
    })).toThrow("destroy.before")
  })

  test("destroy.before отклоняет исполняемый default в сигнатуре wrapper", () => {
    expect(() => parseFinally<{cleanup: boolean}>({
      type: "finally",
      before: async ({mass, energy, probe = (mass.cleanup = true, 0)}: any) => {
        const cleanup = await import("./tests/types/fixtures/finally-cleanup.ts")
        return cleanup.release({mass, energy})
      },
    })).toThrow("destroy.before")
  })
})
