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
    const originalTemplate = html`<button @click=${() => registry.meta.update({ name: "updated" })}>
      ${registry.meta.context.name}
    </button>`
    const serialized = serializeView(originalTemplate)

    // Проверяем структуру сериализованных данных с update функцией
    expect(serialized).toMatchSnapshot()

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

    // Проверяем, что update функция работает и возвращает обновленные поля
    const updatedFields = deserializedParams.update({ name: "updated", value: 999 })
    expect(updatedFields.name, "update должен возвращать обновленное имя").toBe("updated")
    expect(updatedFields.value, "update должен возвращать обновленное значение").toBe(999)
  })

  test("динамическое обновление через функцию update", () => {
    const originalTemplate = html`<button @click=${() => registry.meta.update({ name: "updated" })}>
      ${registry.meta.context.name}
    </button>`
    const serialized = serializeView(originalTemplate)

    // Проверяем структуру сериализованных данных с динамическим обновлением
    expect(serialized).toMatchSnapshot()

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Используем функцию update через ссылку
    const updatedFields = deserializedParams.update({ name: "updated", value: 999 })

    // Проверяем, что update работает и возвращает обновленные поля
    expect(updatedFields.name, "update должен возвращать обновленное имя").toBe("updated")
    expect(updatedFields.value, "update должен возвращать обновленное значение").toBe(999)

    // Проверяем, что ссылка на контекст отражает изменения
    expect(deserializedParams.context.name, "контекст должен обновиться через ссылку").toBe("updated")
    expect(deserializedParams.context.value, "контекст должен обновиться через ссылку").toBe(999)
  })

  test("реальное использование всех параметров view в шаблоне", () => {
    const originalTemplate = html`
      <div class="user-panel">
        <h1>Привет, ${registry.meta.context.name}!</h1>
        <p>Ваш счет: ${registry.meta.context.value}</p>
        <p>Статус: ${registry.meta.state}</p>
        <p>Данные: ${registry.meta.core.data.name}</p>
        <button @click=${() => registry.meta.update({ name: "Новый пользователь", value: 1000 })}>
          Обновить профиль
        </button>
        <button
          @click=${() => {
            registry.meta.core.data.name = "Обновленные данные"
            registry.meta.core.data.value = 500
          }}>
          Обновить данные
        </button>
      </div>
    `
    const serialized = serializeView(originalTemplate)

    // Проверяем структуру сериализованных данных с комплексным шаблоном
    expect(serialized).toMatchSnapshot()

    const { template: deserializedTemplate, params: deserializedParams } = deserializeViewWithParams(
      serialized,
      registry
    )

    expect(deserializedTemplate).toMatchRender(originalTemplate)

    // Проверяем, что все параметры восстановлены как ссылки
    expect(deserializedParams.context.name, "имя контекста должно быть восстановлено").toBe("test")
    expect(deserializedParams.context.value, "значение контекста должно быть восстановлено").toBe(42)
    expect(deserializedParams.state, "состояние должно быть восстановлено").toBe("active")
    expect(deserializedParams.core.data.name, "имя core должно быть восстановлено").toBe("test")
    expect(deserializedParams.core.data.value, "значение core должно быть восстановлено").toBe(42)

    // Проверяем, что update функция работает
    const updatedFields = deserializedParams.update({ name: "Новый пользователь", value: 1000 })
    expect(updatedFields.name, "update должен возвращать обновленное имя").toBe("Новый пользователь")
    expect(updatedFields.value, "update должен возвращать обновленное значение").toBe(1000)
    expect(deserializedParams.context.name, "контекст должен обновиться через ссылку").toBe("Новый пользователь")
    expect(deserializedParams.context.value, "контекст должен обновиться через ссылку").toBe(1000)

    // Проверяем, что core можно обновлять напрямую
    deserializedParams.core.data.name = "Обновленные данные"
    deserializedParams.core.data.value = 500
    expect(deserializedParams.core.data.name, "core должен обновиться через ссылку").toBe("Обновленные данные")
    expect(deserializedParams.core.data.value, "core должен обновиться через ссылку").toBe(500)
  })
})
