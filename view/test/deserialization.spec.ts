/**
 * Тесты десериализации view
 * @module View.Deserialization.Tests
 */

import { describe, test, expect, beforeEach } from "bun:test"
import { render } from "../../html/html"
import { html, nothing } from "../../html/html"
import { ref } from "../../html/directives/ref"
import { repeat } from "../../html/directives/repeat"
import { when } from "../../html/directives/when"
import { map } from "../../html/directives/map"
import { styleMap } from "../../html/directives/style-map"
import { choose } from "../../html/directives/choose"
import { serializeView, deserializeView, serializeViewToString, deserializeViewFromString } from "../serialization"
import type { SerializationContext } from "../serialization.t"
import "../../fixture/expect"

describe("десериализация view", () => {
  let registry: SerializationContext<any, any, any>

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
        update: () => ({}),
        context: {},
        core: {},
        state: "",
      },
    }
  })

  test("десериализация простого шаблона", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с ref", () => {
    const inputRef = ref()
    const originalTemplate = html`<input ${ref(inputRef)} value=${"test"} />`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с repeat", () => {
    const items = ["a", "b", "c"]
    const originalTemplate = html` <ul>
      ${repeat(items, (item) => html`<li>${item}</li>`)}
    </ul>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с when", () => {
    const isVisible = true
    const originalTemplate = html` <div>
      ${when(
        isVisible,
        () => html`<span>Visible content</span>`,
        () => html`<span>Hidden content</span>`
      )}
    </div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с styleMap", () => {
    const styles = { color: "red", fontSize: "16px" }
    const originalTemplate = html`<div style=${styleMap(styles)}>Styled content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с choose", () => {
    const status = "loading"
    const originalTemplate = html` <div>
      ${choose(status, [
        ["loading", () => html`<span>Loading...</span>`],
        ["success", () => html`<span>Success!</span>`],
        ["error", () => html`<span>Error!</span>`],
      ])}
    </div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с nothing", () => {
    const originalTemplate = html`<div>${nothing}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация сложного шаблона", () => {
    const items = ["item1", "item2", "item3"]
    const isVisible = true
    const styles = { backgroundColor: "blue", color: "white" }
    const inputRef = ref()

    const originalTemplate = html`
      <div class="container" style=${styleMap(styles)}>
        <h1>Complex Template</h1>
        ${when(
          isVisible,
          () => html`
            <ul>
              ${repeat(items, (item) => html`<li>${item}</li>`)}
            </ul>
          `
        )}
        <input ${ref(inputRef)} placeholder="Enter text" />
        ${choose("success", [
          ["loading", () => html`<span>Loading...</span>`],
          ["success", () => html`<span>Success!</span>`],
          ["error", () => html`<span>Error!</span>`],
        ])}
      </div>
    `

    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация из JSON строки", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)
    const deserialized = deserializeViewFromString(jsonString, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с вложенными шаблонами", () => {
    const innerTemplate = html`<span>Inner content</span>`
    const originalTemplate = html`<div>${innerTemplate}</div>`

    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с атрибутами", () => {
    const originalTemplate = html`<div class="test" data-value=${"123"}>Content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с событиями", () => {
    const handler = () => console.log("clicked")
    const originalTemplate = html`<button @click=${handler}>Click me</button>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с условными атрибутами", () => {
    const isVisible = true
    const originalTemplate = html`<div ?hidden=${!isVisible}>Visible content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с свойствами", () => {
    const originalTemplate = html`<input .value=${"test value"} />`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с SVG", () => {
    const originalTemplate = html`<svg><circle cx="50" cy="50" r="40" /></svg>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с MathML", () => {
    const originalTemplate = html` <math xmlns="http://www.w3.org/1998/Math/MathML">
      <mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>
    </math>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с динамическими значениями", () => {
    const dynamicValue = "dynamic"
    const originalTemplate = html`<div>${dynamicValue}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с числовыми значениями", () => {
    const number = 42
    const originalTemplate = html`<div>Number: ${number}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с булевыми значениями", () => {
    const bool = true
    const originalTemplate = html`<div>Boolean: ${bool}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с null и undefined", () => {
    const originalTemplate = html`<div>${null} ${undefined}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с объектами", () => {
    const obj = { name: "test", value: 123 }
    const originalTemplate = html`<div>${JSON.stringify(obj)}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с массивами", () => {
    const arr = [1, 2, 3, "test"]
    const originalTemplate = html`<div>${arr.join(", ")}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, registry)

    expect(deserialized).toMatchRender(originalTemplate)
  })
})
