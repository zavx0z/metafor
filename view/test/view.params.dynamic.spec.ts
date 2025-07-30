/**
 * Тесты динамического обновления параметров view
 * @module View.Params.Dynamic.Tests
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

describe("динамическое обновление параметров view", () => {
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

  test("динамическое обновление параметров через ссылки", () => {
    const originalTemplate = html`<div>${registry.meta.context.name} - ${registry.meta.core.data.value}</div>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Изменяем оригинальные параметры через update
    const newContext = { name: "updated", value: 100 }
    const newCore = { data: { name: "updated", value: 100 } }

    // Обновляем параметры в registry
    registry.meta.update(newContext)
    registry.meta.core = newCore

    // Проверяем, что ссылки отражают изменения
    expect(deserializedParams.context.name, "имя контекста должно обновиться через ссылку").toBe("updated")
    expect(deserializedParams.context.value, "значение контекста должно обновиться через ссылку").toBe(100)
    expect(deserializedParams.core, "core должен обновиться через ссылку").toBe(newCore)
  })

  test("динамическое обновление параметров из JSON", () => {
    const originalTemplate = html`<div>
      ${registry.meta.context.name} - ${registry.meta.core.data.value} - ${registry.meta.state}
    </div>`
    const jsonString = serializeViewToString(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewFromStringWithParams(
      jsonString,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Изменяем оригинальные параметры через update
    const newContext = { name: "json_updated", value: 200 }
    const newCore = { data: { name: "json_updated", value: 200 } }

    // Обновляем параметры в registry
    registry.meta.update(newContext)
    registry.meta.core = newCore

    // Проверяем, что ссылки отражают изменения
    expect(deserializedParams.context.name, "имя контекста должно обновиться через ссылку").toBe("json_updated")
    expect(deserializedParams.context.value, "значение контекста должно обновиться через ссылку").toBe(200)
    expect(deserializedParams.core, "core должен обновиться через ссылку").toBe(newCore)
  })
})
