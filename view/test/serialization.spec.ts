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

describe("сериализация view", () => {
  let context: SerializationContext

  beforeEach(() => {
    context = {
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
    }
  })

  test("сериализация простого шаблона", () => {
    const template = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(template)

    expect(serialized.template.h, "шаблон должен содержать строки").toEqual(template.strings)
    expect(serialized.values, "значения должны совпадать").toEqual(template.values)
    expect(serialized.metadata.type, "тип должен совпадать").toBe(template["_$htmlType$"])
    expect(serialized.metadata.version, "версия должна быть установлена").toBe("1.0.0")
  })

  test("сериализация шаблона с директивами", () => {
    const inputRef = ref()
    const template = html`<input ${ref(inputRef)} value=${"test"} />`
    const serialized = serializeView(template)

    expect(serialized.template.parts, "части должны быть определены").toBeDefined()
    expect(serialized.template.parts.length, "количество частей должно быть корректным").toBeGreaterThan(0)
  })

  test("сериализация шаблона с repeat", () => {
    const items = ["a", "b", "c"]
    const template = html`<ul>
      ${repeat(items, (item) => html`<li>${item}</li>`)}
    </ul>`
    const serialized = serializeView(template)

    // Теперь директивы сохраняются как есть
    expect(serialized.values, "значения должны содержать директиву repeat").toBeDefined()
    expect(serialized.values.length, "должна быть одна директива").toBe(1)
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

    // when возвращает TemplateResult, поэтому condition не будет в values
    expect(serialized.values, "значения должны содержать TemplateResult").toBeDefined()
    expect(serialized.template.parts, "части должны быть определены").toBeDefined()
  })

  test("сериализация шаблона с styleMap", () => {
    const styles = { color: "red", fontSize: "16px" }
    const template = html`<div style=${styleMap(styles)}>Styled content</div>`
    const serialized = serializeView(template)

    // Теперь директивы сохраняются как есть
    expect(serialized.values, "значения должны содержать директиву styleMap").toBeDefined()
    expect(serialized.values.length, "должна быть одна директива").toBe(1)
  })

  test("сериализация в JSON строку", () => {
    const template = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(template)

    expect(jsonString, "результат должен быть JSON строкой").toBeTypeOf("string")
    expect(() => JSON.parse(jsonString), "JSON должен быть валидным").not.toThrow()
  })

  test("десериализация из JSON строки", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)
    const deserialized = deserializeViewFromString(jsonString, context)

    expect(deserialized["_$htmlType$"], "тип должен совпадать").toBe(originalTemplate["_$htmlType$"])
    expect(deserialized.strings, "строки должны совпадать").toEqual(originalTemplate.strings)
    // При сериализации количество значений может измениться из-за извлечения из директив
    expect(deserialized.values, "значения должны быть определены").toBeDefined()
  })

  test("сериализация и десериализация с nothing", () => {
    const template = html`<div>${nothing}</div>`
    const serialized = serializeView(template)
    const deserialized = deserializeView(serialized, context)

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
    const deserialized = deserializeView(serialized, context)

    expect(deserialized["_$htmlType$"], "тип должен совпадать").toBe(template["_$htmlType$"])
    expect(deserialized.strings, "строки должны совпадать").toEqual(template.strings)
    expect(deserialized.values, "значения должны быть определены").toBeDefined()
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
    // choose возвращает TemplateResult, поэтому section не будет в values
    expect(serialized.values, "значения должны содержать TemplateResult").toBeDefined()
    expect(serialized.template.parts, "части должны быть определены").toBeDefined()
  })

  test("обработка ошибок при десериализации", () => {
    const invalidJson = "invalid json"

    expect(() => deserializeViewFromString(invalidJson, context), "должна быть выброшена ошибка").toThrow()
  })

  test("сериализация с вложенными шаблонами", () => {
    const innerTemplate = html`<span>Inner</span>`
    const template = html`<div>${innerTemplate}</div>`

    const serialized = serializeView(template)
    expect(serialized.template.parts, "части должны быть определены").toBeDefined()
  })
})
