import { describe, expect, test } from "bun:test"
import { convertMetaToMonadJson, extractArrayElementTypesFromSource } from "../monadJson"
import "@metafor/meta"

describe("convertMetaToMonadJson", () => {
  test("должен преобразовать context в fields с сохранением всех данных", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        name: t.string.required("Anonymous", { label: "Имя" }),
        age: t.number.optional(0),
      }))
      .states({
        idle: { loading: {} },
        loading: null,
      })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.name).toBe("test")
    expect(result.fields.name).toEqual({
      type: "string",
      required: true,
      default: "Anonymous",
      label: "Имя",
    })
    expect(result.fields.age).toEqual({
      type: "number",
      default: 0,
    })
    expect(result.superposition).toEqual({
      idle: { loading: {} },
      loading: null,
    })
  })

  test("должен преобразовать array с generic типом из исходного кода", () => {
    const sourceText = `
      const meta = MetaFor("test")
        .context((t) => ({
          tags: t.array.required<string>([]),
          numbers: t.array.required<number>([1, 2, 3])
        }))
    `

    const meta = MetaFor("test")
      .context((t) => ({
        tags: t.array.required<string>([]),
        numbers: t.array.required<number>([1, 2, 3]),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any, sourceText)

    expect(result.fields.tags.type).toBe("array<string>")
    expect(result.fields.numbers.type).toBe("array<number>")
  })

  test("должен преобразовать array с generic типом из default значения", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        tags: t.array.required<string>(["tag1", "tag2"]),
        numbers: t.array.required<number>([1, 2, 3]),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.fields.tags.type).toBe("array<string>")
    expect(result.fields.numbers.type).toBe("array<number>")
  })

  test("должен выбросить ошибку если не удалось вывести тип массива", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        items: t.array.required([]),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    expect(() => convertMetaToMonadJson(meta as any)).toThrow(
      "Не удалось вывести тип элементов массива для компоненты 'items'"
    )
  })

  test("должен преобразовать enum с string значениями", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        status: t.enum("active", "inactive").required("active"),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.fields.status).toEqual({
      type: "enum<string>",
      values: ["active", "inactive"],
      required: true,
      default: "active",
    })
  })

  test("должен преобразовать enum с number значениями", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        level: t.enum(1, 2, 3).required(1),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.fields.level).toEqual({
      type: "enum<number>",
      values: [1, 2, 3],
      required: true,
      default: 1,
    })
  })

  test("должен выбросить ошибку если enum пустой", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        // @ts-ignore - пустой enum для теста
        status: t.enum().required("active"),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    expect(() => convertMetaToMonadJson(meta as any)).toThrow(
      "Не удалось вывести тип значений enum для компоненты 'status'"
    )
  })

  test("должен преобразовать states в superposition", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        name: t.string.required(""),
      }))
      .states({
        idle: { loading: {} },
        loading: { success: {}, error: {} },
        success: null,
        error: null,
      })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.superposition).toEqual({
      idle: { loading: {} },
      loading: { success: {}, error: {} },
      success: null,
      error: null,
    })
  })

  test("должен включить processes если есть", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        name: t.string.required(""),
      }))
      .states({ idle: null })
      .core()
      .processes((process) => ({
        idle: process().action(({ context }) => Promise.resolve({})),
      }))
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.processes).toBeDefined()
    expect(result.processes!.idle).toBeDefined()
    expect(result.processes!.idle.type).toBe("action")
  })

  test("должен включить reactions если есть", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        name: t.string.required(""),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions((reaction) => [
        [
          ["idle"],
          reaction()
            .filter(() => ({ meta: "test" }))
            .equal(({ update }) => update({ name: "updated" })),
        ],
      ])
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.reactions).toBeDefined()
    expect(result.reactions!.reactions).toBeDefined()
    expect(result.reactions!.states).toBeDefined()
  })

  test("должен выбросить ошибку если context не найден", () => {
    const meta = {
      name: "test",
      states: { idle: null },
    }

    expect(() => convertMetaToMonadJson(meta as any)).toThrow(
      "context не найден или не является объектом"
    )
  })

  test("должен преобразовать простые типы без изменений", () => {
    const meta = MetaFor("test")
      .context((t) => ({
        name: t.string.required(""),
        age: t.number.optional(0),
        active: t.boolean.required(true),
      }))
      .states({ idle: null })
      .core()
      .processes()
      .reactions()
      .view()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.fields).toEqual({
      name: { type: "string", required: true, default: "" },
      age: { type: "number", default: 0 },
      active: { type: "boolean", required: true, default: true },
    })
  })
})

describe("extractArrayElementTypesFromSource", () => {
  test("должен извлечь типы элементов из t.array.required<Type>", () => {
    const sourceText = `
      const meta = MetaFor("test")
        .context((t) => ({
          tags: t.array.required<string>([]),
          numbers: t.array.required<number>([1, 2, 3]),
          items: t.array.optional<string>([])
        }))
    `

    const result = extractArrayElementTypesFromSource(sourceText)

    expect(result).toEqual({
      tags: "string",
      numbers: "number",
      items: "string",
    })
  })

  test("должен вернуть пустой объект если нет объявлений массивов", () => {
    const sourceText = `
      const meta = MetaFor("test")
        .context((t) => ({
          name: t.string.required(""),
          age: t.number.required(0)
        }))
    `

    const result = extractArrayElementTypesFromSource(sourceText)

    expect(result).toEqual({})
  })

  test("должен обработать несколько объявлений в одной строке", () => {
    const sourceText = `
      const meta = MetaFor("test")
        .context((t) => ({
          tags: t.array.required<string>([]), numbers: t.array.required<number>([])
        }))
    `

    const result = extractArrayElementTypesFromSource(sourceText)

    expect(result).toEqual({
      tags: "string",
      numbers: "number",
    })
  })
})
