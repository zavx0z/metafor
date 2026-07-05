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
      }).before(({ mass }) => {
        mass.cleanup = true
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
      }).before(({ mass }) => {
        mass.cleanup = true
      }),
    ]

    const snapshot = processesSchema(actions)
    expect(snapshot.cleanup).toBeDefined()
    expect((snapshot.cleanup!.type as string)).toBe("finally")
    expect(snapshot.cleanup!.label).toBe("Очистка")
    expect(snapshot.cleanup!.desc).toBe("Очистка ресурсов")
    expect(snapshot.cleanup!.env).toEqual(["node", "worker"])
    expect((snapshot.cleanup as { before: { src: string } }).before.src).toContain("mass.cleanup = true")
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
      destroy("cleanup", { label: "Очистка ресурсов", desc: "Удаляет временные данные" }).before(({ mass }) => {
        mass.cleanup = true
      }),
      destroy("finalize", { label: "Финализация" }).before(({ mass }) => {
        mass.bar = 999
      }),
      destroy("simple", { label: "Простое удаление" }),
      destroy("nonRecursive", { label: "Не рекурсивное удаление" }).before(({ mass }) => {
        mass.bar = 0
      }),
    ]

    const snapshot = processesSchema(actions)

    expect(snapshot.cleanup).toBeDefined()
    expect((snapshot.cleanup!.type as string)).toBe("finally")
    expect(snapshot.cleanup!.label).toBe("Очистка ресурсов")
    expect(snapshot.cleanup!.desc).toBe("Удаляет временные данные")
    expect((snapshot.cleanup as { before: { src: string } }).before.src).toContain("mass.cleanup = true")

    expect(snapshot.finalize).toBeDefined()
    expect((snapshot.finalize!.type as string)).toBe("finally")
    expect(snapshot.finalize!.label).toBe("Финализация")
    expect((snapshot.finalize as { before: { src: string } }).before.src).toContain("mass.bar = 999")

    expect(snapshot.simple).toBeDefined()
    expect((snapshot.simple!.type as string)).toBe("finally")
    expect(snapshot.simple!.label).toBe("Простое удаление")

    expect(snapshot.nonRecursive).toBeDefined()
    expect((snapshot.nonRecursive!.type as string)).toBe("finally")
    expect(snapshot.nonRecursive!.label).toBe("Не рекурсивное удаление")
    expect((snapshot.nonRecursive as { before: { src: string } }).before.src).toContain("mass.bar = 0")
  })

  test("parseFinally нормализует before handler", () => {
    const parsed = parseFinally<{ cleanup: boolean }>({
      type: "finally",
      label: "Cleanup",
      desc: "before hook",
      env: ["node"],
      before: ({ mass }: { mass: { cleanup: boolean } }) => {
        mass.cleanup = true
      },
    })

    expect(parsed).toEqual({
      type: "finally",
      label: "Cleanup",
      desc: "before hook",
      env: ["node"],
      before: {
        src: expect.stringContaining("mass.cleanup = true"),
      },
    })
  })
})
