import { describe, expect, test } from "bun:test"
import {
  pattern,
  updateAppendArg,
  trimArrow,
  destroyAppendArg,
  normalizeFunctionString,
  parseFunction,
  extractFields,
  extractModuleSrc,
  validateActionStructure,
} from "./action.js"

describe("Парсер action-функций", () => {
  describe("pattern", () => {
    test("dot — доступ к полям через value.field", () => {
      const code = "value.name + value.age"
      const matches = [...code.matchAll(pattern.dot)]
      expect(matches.map((m) => m[1])).toEqual(["name", "age"])
    })

    test("destructParams — деструктуризация в параметрах", () => {
      const code = "({ value: { name, age } }) => {}"
      const match = pattern.destructParams.exec(code)
      expect(match?.[1]).toBe(" name, age ")
    })

    test("destructBody — деструктуризация в теле функции", () => {
      const code = "const { name, age } = value"
      const match = pattern.destructBody.exec(code)
      expect(match?.[1]).toBe(" name, age ")
    })

    test("update — вызов update с объектом", () => {
      const code = "update({ name: 'test', age: 42 })"
      const match = pattern.update.exec(code)
      expect(match?.[1]).toBe(" name: 'test', age: 42 ")
    })
  })

  describe("updateAppendArg", () => {
    test("добавляет аргумент к update с объектом", () => {
      const fn = ({ value, update }: any) => update({ name: value.name })
      const result = updateAppendArg(fn.toString(), '"test"')
      expect(result).toContain('update({ name: value.name }, "test")')
    })

    test("добавляет аргумент к update(data)", () => {
      const fn = ({ data, update }: any) => update(data)
      const result = updateAppendArg(fn.toString(), '"test"')
      expect(result).toContain('update(data, "test")')
    })

    test("несколько вызовов update", () => {
      const fn = ({ value, update }: any) => {
        update({ a: 1 })
        update({ b: 2 })
      }
      const result = updateAppendArg(fn.toString(), '"test"')
      expect(result).toContain('update({ a: 1 }, "test")')
      expect(result).toContain('update({ b: 2 }, "test")')
    })
  })

  describe("trimArrow", () => {
    test("удаляет стрелочную сигнатуру", () => {
      const fn = ({ value }: any) => value * 2
      const result = trimArrow(fn.toString())
      expect(result).not.toContain("=>")
      expect(result.trim()).toBe("value * 2")
    })

    test("не изменяет функцию без стрелки", () => {
      const code = "function test() { return 1 }"
      const result = trimArrow(code)
      expect(result).toBe(code)
    })
  })

  describe("destroyAppendArg", () => {
    test("добавляет аргумент к destroy()", () => {
      const fn = ({ destroy }: any) => destroy()
      const result = destroyAppendArg(fn.toString(), '"test"')
      expect(result).toContain('destroy("test")')
    })

    test("не изменяет функцию без destroy()", () => {
      const fn = ({ update }: any) => update({})
      const result = destroyAppendArg(fn.toString(), '"test"')
      expect(result).not.toContain('destroy("test")')
    })
  })

  describe("normalizeFunctionString", () => {
    test("заменяет !0 на true", () => {
      const code = "({ mass }) => { mass.active = !0 }"
      const result = normalizeFunctionString(code)
      expect(result).toContain("mass.active = true")
    })

    test("заменяет !1 на false", () => {
      const code = "({ mass }) => { mass.active = !1 }"
      const result = normalizeFunctionString(code)
      expect(result).toContain("mass.active = false")
    })

    test("не заменяет частичные совпадения", () => {
      const code = "const x = 10"
      const result = normalizeFunctionString(code)
      expect(result).toBe(code)
    })
  })

  describe("parseFunction", () => {
    test("извлекает поля из value.field", () => {
      const fn = ({ value }: any) => value.name + value.age
      const result = parseFunction(fn)
      expect(result.read).toEqual(expect.arrayContaining(["name", "age"]))
      expect(result.write).toEqual([])
    })

    test("извлекает поля из деструктуризации параметров", () => {
      const fn = ({ value: { name, age } }: any) => name + age
      const result = parseFunction(fn)
      expect(result.read).toEqual(expect.arrayContaining(["name", "age"]))
    })

    test("извлекает поля из деструктуризации в теле", () => {
      function testFn({ value }: any) {
        const { name, age } = value
        return name + age
      }
      const result = parseFunction(testFn)
      expect(result.read).toEqual(expect.arrayContaining(["name", "age"]))
    })

    test("извлекает поля для записи из update", () => {
      const fn = ({ update }: any) => {
        update({ status: "active", count: 1 })
      }
      const result = parseFunction(fn)
      expect(result.read).toEqual([])
      expect(result.write).toEqual(expect.arrayContaining(["status", "count"]))
    })

    test("allowWrite=false не возвращает write поля", () => {
      const fn = ({ update }: any) => {
        update({ status: "active" })
      }
      const result = parseFunction(fn, false)
      expect(result.write).toEqual([])
    })

    test("комплексный пример", () => {
      const fn = ({ value, update }: any) => {
        const { name } = value
        update({ status: "processed", name: value.name })
      }
      const result = parseFunction(fn)
      expect(result.read).toEqual(expect.arrayContaining(["name"]))
      expect(result.write).toEqual(expect.arrayContaining(["status", "name"]))
    })
  })

  describe("extractFields", () => {
    test("извлекает read поля из value.field", () => {
      const fn = function reaction({ value }: any) {
        return value.name + value.age
      }
      const result = extractFields(fn)
      expect(result.read).toEqual(["name", "age"])
      expect(result.write).toEqual([])
    })

    test("извлекает write поля из update", () => {
      const fn = function reaction({ update }: any) {
        update({ status: "active" })
      }
      const result = extractFields(fn)
      expect(result.write).toEqual(["status"])
      expect(result.read).toContain("status")
    })

    test("записываемое поле добавляется в читаемые", () => {
      const fn = function reaction({ update }: any) {
        update({ count: 1 })
      }
      const result = extractFields(fn)
      expect(result.read).toContain("count")
      expect(result.write).toContain("count")
    })
  })

  describe("extractModuleSrc", () => {
    test("извлекает путь из import()", () => {
      const fn = async ({ value }: { value: unknown }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./actions/loader.ts")
        return mod.default(value)
      }
      const result = extractModuleSrc(fn)
      expect(result).toBe("./actions/loader.ts")
    })

    test("извлекает путь с одинарными кавычками", () => {
      const fn = async ({ value }: { value: unknown }) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import('./actions/saver.ts')
        return mod.default(value)
      }
      const result = extractModuleSrc(fn)
      expect(result).toBe("./actions/saver.ts")
    })

    test("возвращает null при отсутствии import", () => {
      const fn = ({ value }: any) => value * 2
      const result = extractModuleSrc(fn)
      expect(result).toBeNull()
    })

    test("возвращает первый import при нескольких", () => {
      const fn = async ({ value }: { value: unknown }) => {
        // @ts-expect-error — тестовые импорты
        const mod1 = await import("./first.ts")
        // @ts-expect-error
        const mod2 = await import("./second.ts")
        return mod1.default(value)
      }
      const result = extractModuleSrc(fn)
      expect(result).toBe("./first.ts")
    })
  })

  describe("validateActionStructure", () => {
    test("валидная функция с import и return", () => {
      const fn = async ({ value }: any) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mod.ts")
        const result = mod.process(value)
        return result
      }
      const result = validateActionStructure(fn)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    test("невалидная функция без import", () => {
      const fn = ({ value }: any) => value * 2
      const result = validateActionStructure(fn)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("import")
    })

    test("невалидная функция без return", () => {
      const fn = async ({ value }: any) => {
        // @ts-expect-error — тестовый импорт
        const mod = await import("./mod.ts")
        mod.process(value)
        // Нет return
      }
      const result = validateActionStructure(fn)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("return")
    })

    test("игнорирует комментарии при валидации", () => {
      const fn = async ({ value }: any) => {
        // Это комментарий с import("fake.ts")
        // @ts-expect-error — тестовый импорт
        const mod = await import("./real.ts")
        return mod.default(value)
      }
      const result = validateActionStructure(fn)
      expect(result.valid).toBe(true)
    })

    test("игнорирует многострочные комментарии", () => {
      const fn = async ({ value }: any) => {
        /*
         * import("fake.ts")
         * return fake
         */
        // @ts-expect-error — тестовый импорт
        const mod = await import("./real.ts")
        return mod.default(value)
      }
      const result = validateActionStructure(fn)
      expect(result.valid).toBe(true)
    })
  })
})
