import { describe, test, expect } from "bun:test"
import { html } from "../../html"
import { createRef, ref } from "../../html/directives/ref"
import { repeat } from "../../html/directives/repeat"
import { when } from "../../html/directives/when"
import { map } from "../../html/directives/map"
import { styleMap } from "../../html/directives/style-map"
import { choose } from "../../html/directives/choose"
import { Context } from "../../context"
import type { ViewDefinitionParams } from "../index.t"
import { restoreViewFunction, restoreCSSFunction } from ".."
import { extractTemplateLiteral, extractCSSTemplateLiteral } from ".."

describe("serialize and deserialize", () => {
  type State = "active" | "inactive"
  const state = "active" as const

  const { update, context, schema } = new Context((types) => ({
    name: types.string.required("test"),
    value: types.number.required(42),
  }))

  type Core = { data: { name: string; value: number }; data2: number[]; color: string; buttonRef: any }
  const core = {
    data: { name: "test", value: 42 },
    data2: [1, 2, 3],
    color: "red",
    buttonRef: createRef(),
  }

  const createTemplate = ({
    html,
    update,
    context,
    ref,
    repeat,
    when,
    map,
    style,
    choose,
    core,
    state,
  }: ViewDefinitionParams<typeof schema, State, Core>) => {
    return html`<div>
      <button
        type="button"
        style=${style({ color: core.color })}
        ${ref(core.buttonRef)}
        @click=${() => update({ name: "updated" })}>
        ${context.name}
      </button>
      ${when(state === "active", () => html`<div>active</div>`)}
      <ul>
        ${repeat(core.data2, (value) => html`<li>${value}</li>`)}
      </ul>
      ${map(core.data2, (value) => html`<div>${value}</div>`)}
      ${choose(state, [
        ["active", () => html`<div>active</div>`],
        ["inactive", () => html`<div>inactive</div>`],
      ])}
      ${state === "active" ? html`<div>active</div>` : ""}
    </div>`
  }

  test("extractTemplateLiteral: извлечение template literal", () => {
    const template = extractTemplateLiteral(createTemplate)

    expect(template, "должен содержать template").toBeDefined()
    expect(typeof template, "template должен быть строкой").toBe("string")

    // Проверяем, что template содержит HTML
    expect(template, "template должен содержать HTML").toContain("<div>")
    expect(template, "template должен содержать button").toContain("<button")
  })

  test("restoreViewFunction: восстановление функции", () => {
    const template = extractTemplateLiteral(createTemplate)
    const restored = restoreViewFunction(template)

    // Проверяем, что функция работает
    const original = createTemplate({
      html,
      update,
      context,
      ref,
      repeat,
      when,
      map,
      style: styleMap,
      choose,
      core,
      state,
    })
    const restoredResult = restored({
      html,
      update,
      context,
      ref,
      repeat,
      when,
      map,
      style: styleMap,
      choose,
      core,
      state,
    })

    // Сравниваем структуру объектов
    expect(restoredResult._$htmlType$, "тип должен совпадать").toBe(original._$htmlType$)
    expect(restoredResult.strings, "строки должны совпадать").toEqual(original.strings)
    expect(restoredResult.values.length, "количество значений должно совпадать").toBe(original.values.length)
  })
})

test("extractCSSTemplateLiteral: извлечение CSS template literal", () => {
  const createTemplate = ({ css }: { css: any }) => css`
    .container {
      color: red;
      font-size: 16px;
    }
  `
  const template = extractCSSTemplateLiteral(createTemplate)
  expect(template, "CSS template должен быть извлечен").toBe(`
    .container {
      color: red;
      font-size: 16px;
    }
  `)
})

test("extractCSSTemplateLiteral: ошибка при отсутствии CSS template literal", () => {
  const createTemplate = ({ css }: { css: any }) => css("invalid")
  expect(() => extractCSSTemplateLiteral(createTemplate), "должна быть выброшена ошибка").toThrow(
    "Не удалось найти CSS template literal в функции"
  )
})

test("restoreCSSFunction: восстановление CSS функции", () => {
  const originalTemplate = `
    .container {
      color: red;
      font-size: 16px;
    }
  `

  const restoredFunction = restoreCSSFunction(originalTemplate)
  expect(restoredFunction, "функция должна быть восстановлена").toBeInstanceOf(Function)

  // Проверяем, что функция работает
  const mockCss = (strings: any, ...values: any[]) => ({ strings, values })
  const result = restoredFunction({ css: mockCss })

  expect(result.strings[0], "первая строка должна совпадать").toBe(originalTemplate)
  expect(result.values.length, "количество значений должно быть 0").toBe(0)
})

test("полный цикл извлечения и восстановления CSS функции", () => {
  const originalFunction = ({ css }: { css: any }) => css`
    .container {
      color: ${"red"};
      font-size: ${16}px;
    }
  `

  // Извлекаем template literal
  const extractedTemplate = extractCSSTemplateLiteral(originalFunction)

  // Восстанавливаем функцию
  const restoredFunction = restoreCSSFunction(extractedTemplate)

  // Проверяем, что восстановленная функция работает
  const mockCss = (strings: any, ...values: any[]) => ({ strings, values })
  const originalResult = originalFunction({ css: mockCss })
  const restoredResult = restoredFunction({ css: mockCss })

  expect(restoredResult.strings[0], "шаблон должен совпадать").toBe(originalResult.strings[0])
  expect(restoredResult.values.length, "количество значений должно совпадать").toBe(originalResult.values.length)
})

test("сериализация render-функции с замыканиями", () => {
  // Импортируем необходимые функции
  const { serializeRenderFunction, restoreViewFunctionWithClosures } = require("../index")
  
  // Имитируем ситуацию с внешними переменными
  const childHash = "child-243232"
  const parentHash = "parent-456789"
  
  const renderWithClosures = ({ context, html }: any) => html`
    <div>
      <h1>Родитель: ${context.parentMessage}</h1>
      <meta-${childHash}
        context=${{
          message: context.parentMessage,
          count: context.parentCount,
        }}></meta-${childHash}>
      <meta-${parentHash}></meta-${parentHash}>
    </div>
  `
  
  // Сериализуем с контекстом замыканий
  const { template, closures, serialized } = serializeRenderFunction(
    renderWithClosures,
    { childHash, parentHash }
  )
  
  // Проверяем, что функция работает и возвращает ожидаемые результаты
  expect(template).toContain("meta-${\"child-243232\"}")
  expect(template).toContain("meta-${\"parent-456789\"}")
  expect(closures).toEqual({})
  expect(serialized).toContain("meta-child-243232")
  expect(serialized).toContain("meta-parent-456789")
  
  // Восстанавливаем функцию
  const restored = restoreViewFunctionWithClosures(template, closures)
  expect(restored).toBeInstanceOf(Function)
  
  // Проверяем, что восстановленная функция работает
  const mockContext = { parentMessage: "test", parentCount: 5 }
  const result = restored({ context: mockContext, html })
  
  expect(result.strings.join('')).toContain("meta-child-243232")
  expect(result.strings.join('')).toContain("meta-parent-456789")
})
