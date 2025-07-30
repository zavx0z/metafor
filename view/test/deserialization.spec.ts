import { beforeEach, describe, expect, test } from "bun:test"
import { html, nothing, render } from "../../html/html"
import { ref } from "../../html/directives/ref"
import { repeat } from "../../html/directives/repeat"
import { when } from "../../html/directives/when"
import { map } from "../../html/directives/map"
import { styleMap } from "../../html/directives/style-map"
import { choose } from "../../html/directives/choose"
import {
  serializeView,
  deserializeView,
  serializeViewToString,
  deserializeViewFromString,
  deserializeViewWithParams,
  deserializeViewFromStringWithParams,
} from "../serialization"
import type { SerializationContext, ViewParams } from "../serialization.t"
import "../../fixture/expect"

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
      meta: {
        update: (values) => values,
        context: { name: "test", value: 42 },
        core: { data: "core data" },
        state: "active",
      },
    }
  })

  test("десериализация простого шаблона", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с ref", () => {
    const inputRef = ref()
    const originalTemplate = html`<input ${ref(inputRef)} value=${"test"} />`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с repeat", () => {
    const items = ["a", "b", "c"]
    const originalTemplate = html`<ul>
      ${repeat(items, (item) => html`<li>${item}</li>`)}
    </ul>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
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

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с styleMap", () => {
    const styles = { color: "red", fontSize: "16px" }
    const originalTemplate = html`<div style=${styleMap(styles)}>Styled content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
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

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация шаблона с nothing", () => {
    const originalTemplate = html`<div>${nothing}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
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

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация из JSON строки", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)
    const deserialized = deserializeViewFromString(jsonString, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с вложенными шаблонами", () => {
    const innerTemplate = html`<span>Inner</span>`
    const originalTemplate = html`<div>${innerTemplate}</div>`

    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с атрибутами", () => {
    const originalTemplate = html`<div class="test" data-value=${"123"}>Content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с событиями", () => {
    const handler = () => console.log("clicked")
    const originalTemplate = html`<button @click=${handler}>Click me</button>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с условными атрибутами", () => {
    const isVisible = true
    const originalTemplate = html`<div ?hidden=${!isVisible}>Visible content</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с свойствами", () => {
    const originalTemplate = html`<input .value=${"test value"} />`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с SVG", () => {
    const originalTemplate = html`<svg><circle cx="50" cy="50" r="40" /></svg>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с MathML", () => {
    const originalTemplate = html`<math
      ><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math
    >`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с динамическими значениями", () => {
    const dynamicValue = "dynamic"
    const originalTemplate = html`<div>${dynamicValue}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с числовыми значениями", () => {
    const number = 42
    const originalTemplate = html`<div>Number: ${number}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с булевыми значениями", () => {
    const bool = true
    const originalTemplate = html`<div>Boolean: ${bool}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с null и undefined", () => {
    const originalTemplate = html`<div>${null} ${undefined}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с объектами", () => {
    const obj = { name: "test", value: 123 }
    const originalTemplate = html`<div>${JSON.stringify(obj)}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  test("десериализация с массивами", () => {
    const arr = [1, 2, 3, "test"]
    const originalTemplate = html`<div>${arr.join(", ")}</div>`
    const serialized = serializeView(originalTemplate)
    const deserialized = deserializeView(serialized, context)

    expect(deserialized).toMatchRender(originalTemplate)
  })

  // Новые тесты для параметров view
  test("десериализация с параметрами view", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      context
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)
    expect(deserializedParams.context, "контекст должен быть восстановлен").toEqual(context.meta.context)
    expect(deserializedParams.core, "core должен быть восстановлен").toEqual(context.meta.core)
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe(context.meta.state)
    expect(typeof deserializedParams.update, "update должен быть функцией").toBe("function")
  })

  test("десериализация из JSON с параметрами view", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewFromStringWithParams(
      jsonString,
      context
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)
    expect(deserializedParams.context, "контекст должен быть восстановлен").toEqual(context.meta.context)
    expect(deserializedParams.core, "core должен быть восстановлен").toEqual(context.meta.core)
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe(context.meta.state)
  })

  test("десериализация с параметрами view и использованием в шаблоне", () => {
    const originalTemplate = html`<div>Hello ${"World"} - ${"test"} (${42})</div>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      context
    )

    // Проверяем, что шаблон рендерится корректно
    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Проверяем, что параметры восстановлены
    expect(deserializedParams.context.name, "имя из контекста должно быть восстановлено").toBe("test")
    expect(deserializedParams.context.value, "значение из контекста должно быть восстановлено").toBe(42)
    expect(deserializedParams.core.data, "данные из core должны быть восстановлены").toBe("core data")
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe("active")

    // Проверяем, что update функция работает
    const updatedContext = deserializedParams.update({ name: "updated" })
    expect(updatedContext.name, "update должен обновлять контекст").toBe("updated")
  })

  test("десериализация с параметрами view и сложным контекстом", () => {
    const originalTemplate = html`<div>Complex template</div>`

    // Создаем контекст со сложными данными
    const complexContext: SerializationContext = {
      directives: context.directives,
      utils: context.utils,
      meta: {
        update: (values) => values,
        context: {
          user: { id: 1, name: "John" },
          settings: { theme: "dark", language: "ru" },
          items: ["item1", "item2", "item3"],
        },
        core: {
          api: { baseUrl: "https://api.example.com" },
          cache: { enabled: true, ttl: 3600 },
        },
        state: "loading",
      },
    }

    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      complexContext
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)
    expect(deserializedParams.context.user.id, "ID пользователя должен быть восстановлен").toBe(1)
    expect(deserializedParams.context.user.name, "имя пользователя должно быть восстановлено").toBe("John")
    expect(deserializedParams.context.settings.theme, "тема должна быть восстановлена").toBe("dark")
    expect(deserializedParams.context.items, "массив элементов должен быть восстановлен").toEqual([
      "item1",
      "item2",
      "item3",
    ])
    expect(deserializedParams.core.api.baseUrl, "базовый URL должен быть восстановлен").toBe("https://api.example.com")
    expect(deserializedParams.core.cache.enabled, "настройка кеша должна быть восстановлена").toBe(true)
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe("loading")
  })
})
