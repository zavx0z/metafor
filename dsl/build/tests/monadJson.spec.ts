import { describe, expect, test } from "bun:test"
import { convertMetaToMonadJson, extractArrayElementTypesFromSource } from "../monadJson"
import "../../meta/metafor.ts"

describe("convertMetaToMonadJson", () => {
  test("должен преобразовать fields с сохранением всех данных", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        name: field.string.required("Anonymous", { label: "Имя" }),
        age: field.number.optional(0),
      }))
      .superposition({
        idle: { loading: {} },
        loading: null,
      })
      .mass()
      .processes()
      .reactions()
      .bulk()

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
        .brane((field) => ({
          tags: field.array.required<string>([]),
          numbers: field.array.required<number>([1, 2, 3]),
        }))
    `

    const meta = MetaFor("test")
      .fields((field) => ({
        tags: field.array.required<string>([]),
        numbers: field.array.required<number>([1, 2, 3]),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any, sourceText)

    expect(result.fields.tags!.type).toBe("array<string>")
    expect(result.fields.numbers!.type).toBe("array<number>")
  })

  test("должен преобразовать array с generic типом из default значения", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        tags: field.array.required<string>(["tag1", "tag2"]),
        numbers: field.array.required<number>([1, 2, 3]),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.fields.tags!.type).toBe("array<string>")
    expect(result.fields.numbers!.type).toBe("array<number>")
  })

  test("должен выбросить ошибку если не удалось вывести тип массива", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        items: field.array.required([]),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

    expect(() => convertMetaToMonadJson(meta as any)).toThrow(
      "Не удалось вывести тип элементов массива для компоненты 'items'"
    )
  })

  test("должен преобразовать enum с string значениями", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        status: field.enum("active", "inactive").required("active"),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

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
      .fields((field) => ({
        level: field.enum(1, 2, 3).required(1),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

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
      .fields((field) => ({
        // @ts-ignore - пустой enum для теста
        status: field.enum().required("active"),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

    expect(() => convertMetaToMonadJson(meta as any)).toThrow(
      "Не удалось вывести тип значений enum для компоненты 'status'"
    )
  })

  test("должен преобразовать states в superposition", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        name: field.string.required(""),
      }))
      .superposition({
        idle: { loading: {} },
        loading: { success: {}, error: {} },
        success: null,
        error: null,
      })
      .mass()
      .processes()
      .reactions()
      .bulk()

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
      .fields((field) => ({
        name: field.string.required(""),
      }))
      .superposition({ idle: null })
      .mass()
      .processes((process) => ({
        idle: process().action(async ({ value }) => {
          // @ts-ignore - mock module for testing
          const mod = await import("./mock-action.ts")
          return mod.default(value)
        }),
      }))
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.processes).toBeDefined()
    expect(result.processes!.idle).toBeDefined()
    expect(result.processes!.idle!.type).toBe("action")
  })

  test("должен включить reactions если есть", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        name: field.string.required(""),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions((reaction) => [
        [
          ["idle"],
          reaction()
            .filter(() => ({ meta: "test" }))
            .equal(({ update }) => update({ name: "updated" })),
        ],
      ])
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.reactions).toBeDefined()
    expect(result.reactions!.reactions).toBeDefined()
    expect(result.reactions!.superposition).toBeDefined()
  })

  test("должен выбросить ошибку если fields не найден", () => {
    const meta = {
      name: "test",
      superposition: { idle: null },
    }

    expect(() => convertMetaToMonadJson(meta as any)).toThrow(
      "brane не найден или не является объектом"
    )
  })

  test("должен преобразовать простые типы без изменений", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        name: field.string.required(""),
        age: field.number.optional(0),
        active: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.fields).toEqual({
      name: { type: "string", required: true, default: "" },
      age: { type: "number", default: 0 },
      active: { type: "boolean", required: true, default: true },
    })
  })

  test("должен преобразовать processes с action/success/error", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        value: field.number.required(0),
      }))
      .superposition({ idle: { done: {} }, done: null })
      .mass()
      .processes((process) => ({
        idle: process({ label: "Test Process", desc: "Описание процесса" })
          // @ts-ignore
          .action(async ({ value }) => {
            // @ts-ignore - mock module for testing
            const mod = await import("./mock-action.ts")
            return mod.default({ result: value.value * 2 })
          })
          .success(({ update, data }) => {
            update({ value: data.result })
          })
          .error(({ update, error }) => {
            update({ value: 0 })
            console.error("Error:", error.message)
          }),
      }))
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.processes).toBeDefined()
    expect(result.processes!.idle).toEqual({
      type: "action",
      label: "Test Process",
      desc: "Описание процесса",
      action: {
        read: ["value"],
      },
      success: {
        src: expect.any(String),
        write: ["value"],
      },
      error: {
        src: expect.any(String),
        write: ["value"],
      },
    })
  })

  test("должен преобразовать destroy процесс", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        value: field.number.required(0),
      }))
      .superposition({ idle: { done: {} }, done: null })
      .mass()
      .processes((process, destroy) => ({
        done: destroy({ label: "Cleanup", desc: "Очистка" }),
      }))
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.processes!.done).toEqual({
      type: "finally",
      label: "Cleanup",
      desc: "Очистка",
      before: {
        src: expect.stringContaining("() =>"),
      },
    })
  })

  test("должен преобразовать reactions с filter и equal", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        value: field.number.required(0),
        isActive: field.boolean.required(false),
      }))
      .superposition({ idle: { active: {} }, active: null })
      .mass()
      .processes()
      .reactions((reaction) => [
        [
          ["idle"],
          reaction({ label: "Value Update", desc: "Обновление значения" })
            .filter(({ self, value }) => ({
              meta: "source",
              value: { gt: 0 },
            }))
            .equal(({ update, patch }) => {
              update({ value: patch.value })
            }),
        ],
      ])
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.reactions).toBeDefined()
    const reaction = result.reactions!.reactions["0"]
    expect(reaction!.label).toBe("Value Update")
    expect(reaction!.desc).toBe("Обновление значения")
    expect(reaction!.cond).toContain("({ self, value }) =>")
    expect(reaction!.src).toContain("({ update, patch }) =>")
    expect(reaction!.write).toEqual(["value"])
    expect(result.reactions!.superposition.idle).toEqual(["0"])
  })

  test("должен преобразовать view с render и style", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        label: field.string.required("Test"),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .bulk({
        gravity: ({ value, state, html, update }) =>
          html`<div>
            <h1>${value.label}</h1>
            <p>State: ${state}</p>
            <button onclick=${() => update({ label: "Clicked" })}>Click</button>
          </div>`,
        view: ({ css }) => css`
          div {
            padding: 16px;
          }
          h1 {
            color: blue;
          }
        `,
      })

    const result = convertMetaToMonadJson(meta as any)

    expect(result.bulk).toBeDefined()
    expect(result.bulk!.gravity).toBeDefined()
    expect(Array.isArray(result.bulk!.gravity)).toBe(true)
    const firstNode = result.bulk!.gravity![0] as { tag: string }
    expect(firstNode.tag).toBe("div")
    expect(result.bulk!.view).toContain("div{padding:16px;")
    expect(result.bulk!.view).toContain("h1{color:blue;")
  })

  test("должен преобразовать core с данными", () => {
    const meta = MetaFor("test")
      .fields((field) => ({
        value: field.number.required(0),
      }))
      .superposition({ idle: null })
      .mass({
        history: [] as number[],
        metadata: {
          created: Date.now(),
          version: "1.0.0",
        },
        cache: new Map<string, number>(),
      })
      .processes()
      .reactions()
      .bulk()

    const result = convertMetaToMonadJson(meta as any)

    expect(result.mass).toBeDefined()
    expect(result.mass!.history).toEqual([])
    expect(result.mass!.metadata).toEqual({
      created: expect.any(Number),
      version: "1.0.0",
    })
  })

  test("должен преобразовать полный атом со всеми компонентами", () => {
    const meta = MetaFor("complete")
      .fields((field) => ({
        name: field.string.required("Test", { label: "Название" }),
        count: field.number.required(0),
      }))
      .superposition({ idle: { done: {} }, done: null })
      .mass({ data: [] as string[] })
      .processes((process) => ({
        idle: process({ label: "Process" })
          .action(async ({ value }) => {
            const mod = await import("./mock-action.ts")
            return mod.default(value.count)
          })
          .success(({ update, data }) => update({ count: data as number })),
      }))
      .reactions((reaction) => [
        [
          ["idle"],
          reaction()
            .filter(() => ({ meta: "test" }))
            .equal(({ update }) => update({ count: 1 })),
        ],
      ])
      .bulk({
        gravity: ({ value, html }) => html`<div>${value.name}</div>`,
        view: ({ css }) => css`div { color: red; }`,
      })

    const result = convertMetaToMonadJson(meta as any)

    expect(result.name).toBe("complete")
    expect(result.fields).toBeDefined()
    expect(result.superposition).toBeDefined()
    expect(result.processes).toBeDefined()
    expect(result.reactions).toBeDefined()
    expect(result.bulk).toBeDefined()
    expect(result.mass).toBeDefined()
  })
})

describe("extractArrayElementTypesFromSource", () => {
  test("должен извлечь типы элементов из field.array.required<Type>", () => {
    const sourceText = `
      const meta = MetaFor("test")
        .brane((field) => ({
          tags: field.array.required<string>([]),
          numbers: field.array.required<number>([1, 2, 3]),
          items: field.array.optional<string>([]),
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
        .brane((field) => ({
          name: field.string.required(""),
          age: field.number.required(0),
        }))
    `

    const result = extractArrayElementTypesFromSource(sourceText)

    expect(result).toEqual({})
  })

  test("должен обработать несколько объявлений в одной строке", () => {
    const sourceText = `
      const meta = MetaFor("test")
        .brane((field) => ({
          tags: field.array.required<string>([]), numbers: field.array.required<number>([]),
        }))
    `

    const result = extractArrayElementTypesFromSource(sourceText)

    expect(result).toEqual({
      tags: "string",
      numbers: "number",
    })
  })
})
