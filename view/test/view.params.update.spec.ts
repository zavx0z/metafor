/**
 * Тесты обновления параметров view
 * @module View.Params.Update.Tests
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
import {
  serializeView,
  deserializeViewWithParams,
  serializeViewToString,
  deserializeViewFromStringWithParams,
} from "../serialization"
import type { SerializationContext } from "../serialization.t"
import { createContext, types } from "../../context"
import "../../fixture/expect"

describe("обновление параметров view", () => {
  let registry: SerializationContext<any, any, any>

  beforeEach(() => {
    const state = "active" as const
    const schema = {
      name: types.string.required("test"),
      value: types.number.required(42),
    }
    const { update, context } = createContext(schema)
    const core = { data: { name: "test", value: 42 } }

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

  test("десериализация с параметрами view и использованием в шаблоне", () => {
    const originalTemplate = html`<button @click=${registry.meta.update({ name: "updated" })}>
      ${registry.meta.context.name}
    </button>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    // Проверяем, что шаблон рендерится корректно
    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Проверяем, что параметры восстановлены как ссылки
    expect(deserializedParams.context.name, "имя из контекста должно быть восстановлено").toBe("test")
    expect(deserializedParams.core.data.name, "имя из core должно быть восстановлено").toBe("test")
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe("active")

    // Проверяем, что update функция работает
    const updatedContext = deserializedParams.update({ name: "updated", value: 999 })
    expect(updatedContext.name, "update должен обновлять контекст").toBe("updated")
  })

  test("динамическое обновление через функцию update", () => {
    const originalTemplate = html`<button @click=${registry.meta.update({ name: "updated" })}>
      ${registry.meta.context.name}
    </button>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Используем функцию update через ссылку
    const updatedContext = deserializedParams.update({ name: "updated", value: 999 })

    // Проверяем, что update работает и возвращает обновленный контекст
    expect(updatedContext.name, "update должен обновлять контекст").toBe("updated")
    expect(updatedContext.value, "update должен обновлять значение").toBe(999)

    // Проверяем, что ссылка на контекст отражает изменения
    expect(deserializedParams.context.name, "контекст должен обновиться через ссылку").toBe("updated")
    expect(deserializedParams.context.value, "контекст должен обновиться через ссылку").toBe(999)
  })
})
