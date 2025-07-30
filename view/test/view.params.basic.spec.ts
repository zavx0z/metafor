/**
 * Базовые тесты параметров view
 * @module View.Params.Basic.Tests
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

describe("базовые параметры view", () => {
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

  test("десериализация с параметрами view", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)
    expect(deserializedParams.context, "контекст должен быть восстановлен").toEqual(registry.meta.context)
    expect(deserializedParams.core, "core должен быть восстановлен").toEqual(registry.meta.core)
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe(registry.meta.state)
    expect(typeof deserializedParams.update, "update должен быть функцией").toBe("function")
  })

  test("десериализация из JSON с параметрами view", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const jsonString = serializeViewToString(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewFromStringWithParams(
      jsonString,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)
    expect(deserializedParams.context, "контекст должен быть восстановлен").toEqual(registry.meta.context)
    expect(deserializedParams.core, "core должен быть восстановлен").toEqual(registry.meta.core)
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe(registry.meta.state)
  })

  test("десериализация с динамическими ссылками на параметры", () => {
    const originalTemplate = html`<div>Hello ${"World"}</div>`
    const serialized = serializeView(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Проверяем, что это ссылки, а не копии
    expect(deserializedParams.context, "контекст должен быть ссылкой").toBe(registry.meta.context)
    expect(deserializedParams.core, "core должен быть ссылкой").toBe(registry.meta.core)
    expect(deserializedParams.state, "состояние должно быть ссылкой").toBe(registry.meta.state)
    expect(deserializedParams.update, "update должен быть ссылкой").toBe(registry.meta.update)
  })

  test("десериализация из JSON с динамическими ссылками", () => {
    const originalTemplate = html`<button @click=${registry.meta.update({ name: "updated" })}>
      ${registry.meta.context.name}
    </button>`
    const jsonString = serializeViewToString(originalTemplate)

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewFromStringWithParams(
      jsonString,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Проверяем, что это ссылки, а не копии
    expect(deserializedParams.context, "контекст должен быть ссылкой").toBe(registry.meta.context)
    expect(deserializedParams.core, "core должен быть ссылкой").toBe(registry.meta.core)
    expect(deserializedParams.state, "состояние должно быть ссылкой").toBe(registry.meta.state)
    expect(deserializedParams.update, "update должен быть ссылкой").toBe(registry.meta.update)
  })
})
