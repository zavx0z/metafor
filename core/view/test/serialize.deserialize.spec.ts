import { describe, test, expect } from "bun:test"
import { html, nothing, render } from "../../html/html"
import { createRef, ref } from "../../html/directives/ref"
import { repeat } from "../../html/directives/repeat"
import { when } from "../../html/directives/when"
import { map } from "../../html/directives/map"
import { styleMap } from "../../html/directives/style-map"
import { choose } from "../../html/directives/choose"
import { createContext, types } from "../../context"
import type { ViewDefinitionParams } from "../index.t"
import { restoreViewFunction } from ".."
import { extractTemplateLiteral, extractCSSTemplateLiteral } from ".."

describe("serialize and deserialize", () => {
  type State = "active" | "inactive"
  const state = "active" as const

  const schema = {
    name: types.string.required("test"),
    value: types.number.required(42),
  }
  const { update, context } = createContext(schema)

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
    nothing,
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
      ${state === "active" ? html`<div>active</div>` : nothing}
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
      nothing,
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
      nothing,
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
  expect(() => extractCSSTemplateLiteral(createTemplate), "должна быть выброшена ошибка").toThrow("Не удалось найти CSS template literal в функции")
})
