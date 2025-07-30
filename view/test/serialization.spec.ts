import { beforeEach, describe, expect, test } from "bun:test"
import { html, nothing } from "../../html/html"
import { ref } from "../../html/directives/ref"
import { repeat } from "../../html/directives/repeat"
import { when } from "../../html/directives/when"
import { map } from "../../html/directives/map"
import { styleMap } from "../../html/directives/style-map"
import { choose } from "../../html/directives/choose"
import { serializeView, deserializeView, serializeViewToString, deserializeViewFromString } from "../serialization"
import type { SerializationContext } from "../serialization.t"
import { createContext } from "../../context"
import { types } from "../../context/types"

describe("сериализация view", () => {
  const state = "active"
  const schema = { name: types.string.required() }
  const { update, context } = createContext(schema)
  const core = { data: { name: "test", value: 42 } }

  let registry: SerializationContext<typeof schema, typeof core, typeof state>

  beforeEach(() => {
    registry = {
      directives: {
        ref,
        repeat,
        when,
        map,
        styleMap,
        choose,
      },
      utils: {
        html,
        nothing,
      },
      meta: {
        update,
        context,
        core,
        state,
      },
    }
  })

  test("сериализация простого шаблона", () => {
    const template = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(template)

    expect(serialized.template.h, "шаблон должен содержать строки").toEqual(["<div>Hello ", "</div>"])
    expect(serialized.values, "значения должны быть сериализовано").toEqual(["World"])
    expect(serialized.metadata.version, "версия должна быть установлена").toBe("1.0")
    expect(serialized.metadata.timestamp, "timestamp должен быть установлен").toBeGreaterThan(0)
  })

  test("сериализация шаблона с директивами", () => {
    const items = ["a", "b", "c"]
    const template = html`<ul>
      ${repeat(items, (item) => html`<li>${item}</li>`)}
    </ul>`
    const serialized = serializeView(template)

    expect(serialized.values.length, "должно быть значение").toBeGreaterThan(0)
    expect(serialized.values[0], "первое значение должно быть директивой").toHaveProperty("_$htmlDirective$")
    expect(serialized.values[0], "директива должна содержать значения").toHaveProperty("values")
    expect((serialized.values[0] as any).values, "значения должны быть внутри директивы").toContain(items)
  })

  test("сериализация шаблона с repeat", () => {
    const items = ["a", "b", "c"]
    const template = html`<ul>
      ${repeat(items, (item) => html`<li>${item}</li>`)}
    </ul>`
    const serialized = serializeView(template)

    expect(serialized.values.length, "должно быть значение").toBeGreaterThan(0)
    expect(serialized.values[0], "первое значение должно быть директивой").toHaveProperty("_$htmlDirective$")
    expect(serialized.values[0], "директива должна содержать значения").toHaveProperty("values")
    expect((serialized.values[0] as any).values, "массив items должен быть внутри директивы").toContain(items)
  })

  test("сериализация шаблона с when", () => {
    const condition = true
    const template = html`<div>
      ${when(
        condition,
        () => html`<span>True</span>`,
        () => html`<span>False</span>`
      )}
    </div>`
    const serialized = serializeView(template)

    expect(serialized.values.length, "должно быть значение").toBeGreaterThan(0)
    // when возвращает TemplateResult, а не директиву
    expect(serialized.values[0], "первое значение должно быть TemplateResult").toHaveProperty("_$htmlType$")
    expect(serialized.values[0], "TemplateResult должен содержать строки").toHaveProperty("strings")
    expect(serialized.values[0], "TemplateResult должен содержать значения").toHaveProperty("values")
  })

  test("сериализация шаблона с styleMap", () => {
    const styles = { color: "red", fontSize: "16px" }
    const template = html`<div style=${styleMap(styles)}>Styled content</div>`
    const serialized = serializeView(template)

    expect(serialized.values.length, "должно быть значение").toBeGreaterThan(0)
    expect(serialized.values[0], "первое значение должно быть директивой").toHaveProperty("_$htmlDirective$")
    expect(serialized.values[0], "директива должна содержать значения").toHaveProperty("values")
    expect((serialized.values[0] as any).values, "стили должны быть внутри директивы").toContain(styles)
  })

  test("сериализация в JSON строку", () => {
    const template = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(template)

    expect(typeof jsonString, "результат должен быть строкой").toBe("string")
    expect(() => JSON.parse(jsonString), "JSON должен быть валидным").not.toThrow()
  })

  test("десериализация из JSON строки", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)
    const deserialized = deserializeViewFromString(jsonString, registry)

    expect(deserialized.strings, "строки должны быть восстановлены").toEqual(originalTemplate.strings)
    expect(deserialized.values, "значения должны быть восстановлены").toEqual(originalTemplate.values)
  })

  test("сериализация и десериализация с nothing", () => {
    const template = html`<div>${nothing}</div>`
    const serialized = serializeView(template)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized.values, "nothing должен быть восстановлен").toContain(nothing)
  })

  test("сериализация сложного шаблона", () => {
    const items = ["item1", "item2"]
    const inputRef = ref()
    const styles = { backgroundColor: "blue" }

    const template = html`
      <div style=${styleMap(styles)}>
        <h1>Title</h1>
        <input ${ref(inputRef)} />
        <ul>
          ${repeat(items, (item) => html`<li>${item}</li>`)}
        </ul>
        ${when(
          items.length > 0,
          () => html`<p>Has items</p>`,
          () => html`<p>No items</p>`
        )}
      </div>
    `

    const serialized = serializeView(template)

    expect(serialized.values.length, "должно быть несколько значений").toBeGreaterThan(3)

    // Проверяем, что есть директивы
    const hasDirectives = serialized.values.some(
      (value) => typeof value === "object" && value !== null && "_$htmlDirective$" in value
    )
    expect(hasDirectives, "должны быть директивы").toBe(true)

    // Проверяем, что значения находятся внутри директив
    const hasItemsInDirective = serialized.values.some(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "_$htmlDirective$" in value &&
        (value as any).values &&
        (value as any).values.includes(items)
    )
    expect(hasItemsInDirective, "items должны быть в директиве").toBe(true)

    const hasStylesInDirective = serialized.values.some(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "_$htmlDirective$" in value &&
        (value as any).values &&
        (value as any).values.includes(styles)
    )
    expect(hasStylesInDirective, "styles должны быть в директиве").toBe(true)
  })

  test("сериализация с choose", () => {
    const section = "home"
    const template = html`
      ${choose(
        section,
        [
          ["home", () => html`<h1>Home</h1>`],
          ["about", () => html`<h1>About</h1>`],
        ],
        () => html`<h1>Error</h1>`
      )}
    `
    const serialized = serializeView(template)

    expect(serialized.values.length, "должно быть значение").toBeGreaterThan(0)
    // choose возвращает TemplateResult, а не директиву
    expect(serialized.values[0], "первое значение должно быть TemplateResult").toHaveProperty("_$htmlType$")
    expect(serialized.values[0], "TemplateResult должен содержать строки").toHaveProperty("strings")
    expect(serialized.values[0], "TemplateResult должен содержать значения").toHaveProperty("values")
  })

  test("обработка ошибок при десериализации", () => {
    const invalidJson = '{"invalid": "json"}'

    expect(() => deserializeViewFromString(invalidJson, registry), "должна быть ошибка при неверном JSON").toThrow()
  })

  test("сериализация с вложенными шаблонами", () => {
    const innerTemplate = html`<span>Inner</span>`
    const template = html`<div>${innerTemplate}</div>`
    const serialized = serializeView(template)

    expect(serialized.values, "вложенный шаблон должен быть сохранен").toContain(innerTemplate)
  })
})
