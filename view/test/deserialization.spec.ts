import { beforeEach, describe, expect, test } from "bun:test"
import { html, nothing, render } from "../../html/html"
import { ref } from "../../html/directives/ref"
import { repeat } from "../../html/directives/repeat"
import { when } from "../../html/directives/when"
import { map } from "../../html/directives/map"
import { styleMap } from "../../html/directives/style-map"
import { choose } from "../../html/directives/choose"
import { serializeView, deserializeView, serializeViewToString, deserializeViewFromString } from "../serialization"
import type { SerializationContext } from "../serialization.t"
import type { TemplateResult } from "../../html/html.t"

describe("десериализация view", () => {
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

  // Вспомогательная функция для сравнения рендера
  function compareRender(originalTemplate: TemplateResult, deserializedTemplate: TemplateResult) {
    const originalContainer = document.createElement("div")
    const deserializedContainer = document.createElement("div")

    render(originalTemplate, originalContainer)
    render(deserializedTemplate, deserializedContainer)

    return {
      originalHTML: originalContainer.innerHTML,
      deserializedHTML: deserializedContainer.innerHTML,
    }
  }

  test("десериализация простого шаблона", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация шаблона с ref", () => {
    const inputRef = ref()
    const originalTemplate = html`<input ${ref(inputRef)} value=${"test"} />`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация шаблона с repeat", () => {
    const items = ["a", "b", "c"]
    const originalTemplate = html`<ul>
      ${repeat(items, (item) => html`<li>${item}</li>`)}
    </ul>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация шаблона с when", () => {
    const condition = true
    const originalTemplate = html`<div>
      ${when(
        condition,
        () => html`<span>True</span>`,
        () => html`<span>False</span>`
      )}
    </div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация шаблона с styleMap", () => {
    const styles = { color: "red", fontSize: "16px" }
    const originalTemplate = html`<div style=${styleMap(styles)}>Styled content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация шаблона с choose", () => {
    const section = "home"
    const originalTemplate = html`
      ${choose(
        section,
        [
          ["home", () => html`<h1>Home</h1>`],
          ["about", () => html`<h1>About</h1>`],
        ],
        () => html`<h1>Error</h1>`
      )}
    `
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация шаблона с nothing", () => {
    const originalTemplate = html`<div>${nothing}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация сложного шаблона", () => {
    const items = ["item1", "item2"]
    const inputRef = ref()
    const styles = { backgroundColor: "blue" }

    const originalTemplate = html`
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

    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация из JSON строки", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)
    const deserialized = deserializeViewFromString(jsonString, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с вложенными шаблонами", () => {
    const innerTemplate = html`<span>Inner</span>`
    const originalTemplate = html`<div>${innerTemplate}</div>`

    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с атрибутами", () => {
    const originalTemplate = html`<div class="test" data-value=${"123"}>Content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с событиями", () => {
    const handler = () => console.log("clicked")
    const originalTemplate = html`<button @click=${handler}>Click me</button>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с условными атрибутами", () => {
    const isVisible = true
    const originalTemplate = html`<div ?hidden=${!isVisible}>Visible content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с свойствами", () => {
    const originalTemplate = html`<input .value=${"test value"} />`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с SVG", () => {
    const originalTemplate = html`<svg><circle cx="50" cy="50" r="40" /></svg>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с MathML", () => {
    const originalTemplate = html`<math
      ><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math
    >`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с динамическими значениями", () => {
    const dynamicValue = "dynamic"
    const originalTemplate = html`<div>${dynamicValue}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с числовыми значениями", () => {
    const number = 42
    const originalTemplate = html`<div>Number: ${number}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с булевыми значениями", () => {
    const bool = true
    const originalTemplate = html`<div>Boolean: ${bool}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с null и undefined", () => {
    const originalTemplate = html`<div>${null} ${undefined}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с объектами", () => {
    const obj = { name: "test", value: 123 }
    const originalTemplate = html`<div>${JSON.stringify(obj)}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })

  test("десериализация с массивами", () => {
    const arr = [1, 2, 3, "test"]
    const originalTemplate = html`<div>${arr.join(", ")}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    const { originalHTML, deserializedHTML } = compareRender(originalTemplate, deserialized)
    expect(deserializedHTML, "HTML должен совпадать").toBe(originalHTML)
  })
})
