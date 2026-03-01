/**
 * MetaFor - фреймворк для создания атома конечного автомата
 *
 * MetaFor предоставляет декларативный способ создания web-компонентов с конечным автоматом.
 * Каждый компонент имеет типизированный контекст, состояния, процессы, реакции и представление.
 *
 * ## Архитектура
 *
 * **Атомы MetaFor имеют полную изоляцию с независимой реализацией**
 * - Все взаимодействия между атомами происходят через патчи в сообщениях
 * - Используйте систему сообщений и реакций для связи между компонентами
 *
 * ## Новые возможности
 *
 * ### Позиционные пути (Path)
 * - Каждый атом имеет уникальный позиционный путь в VDOM (например, "0/1/2")
 * - Пути генерируются автоматически через `Fields`
 * - Доступны в `Self` объекте: `{ meta, atom, path }`
 *
 * ### Расширенные фильтры реакций
 * - Доступ к контексту в функции `filter`: `filter(({ self, fields }) => ...)`
 * - Декларативные условия фильтрации с поддержкой сложных условий
 * - Фильтрация по meta, atom, path, op, value, timestamp
 *
 * ### Иерархия атомов
 * - `Fields` для управления позиционными путями
 * - Автоматическая генерация корневых путей
 * - Управление иерархией VDOM
 *
 * ### Шаблонизация
 * - Использует `@zavx0z/template` для рендеринга
 * - Поддержка JavaScript выражений в template literals
 * - Типобезопасный template API
 *
 * @example
 * ```typescript
 * export default MetaFor("user-profile")
 *   .fields((types) => ({
 *     userId: types.number.required(0),
 *     userName: types.string.required(""),
 *     isLoading: types.boolean.required(false),
 *   }))
 *   .states({
 *     idle: { loading: {} },
 *     loading: { success: {}, error: {} },
 *     success: { idle: {} },
 *     error: { idle: {} },
 *   })
 *   .core({ users: [] })
 *   .processes((process) => ({
 *     loadUser: process()
 *       .action(async ({ context }) => {
 *         const response = await fetch(`/api/users/${fields.userId}`)
 *         return await response.json()
 *       })
 *       .success(({ update, data }) => {
 *         update({ userName: data.name, isLoading: false })
 *       })
 *   }))
 *   .reactions((reaction) => [
 *     [
 *       ["idle"],
 *       reaction()
 *         .filter(({ self, fields }) => ({
 *           meta: "user",
 *           atom: self.atom.split("/")[1] || "",
 *           value: { gt: 0 }
 *         }))
 *         .equal(({ update }) => update({ isLoading: true }))
 *     ]
 *   ])
 *   .view({
 *     render: ({ fields, html, update }) => html`
 *       <div>
 *         <h1>${fields.userName}</h1>
 *         <button onclick=${() => update({ isLoading: true })}>
 *           Загрузить
 *         </button>
 *       </div>
 *     `
 *   })
 * ```
 *
 * @packageDocumentation
 */
import { contextSchema, type Schema, type Types as Fields } from "@zavx0z/context"
import { parse, type NodeLogical, type NodeMeta, type Node as NodeType } from "@zavx0z/template"
import type { Mass } from "../atom/gravity.t"

import { validateNoUnconditionalCycles, type Superposition } from "./states"
import { reactionsSchema, type ReactionsDeclaration } from "./reactions"
import { processesSchema, type ProcessesDeclaration } from "./process"
import { serializeStyle } from "./style"

import type { MetaForConfig, MetaFor, BulkDeclaration, Meta } from "./metafor.t"
import type { Self } from "../atom/atom"

export type { MetaFor, Meta, Self, Superposition, NodeMeta, NodeType, NodeLogical }

globalThis.MetaFor = function (name: string, config?: MetaForConfig) {
  const desc = config?.desc
  const dev = config?.dev ?? globalThis.DEV ?? false
  return {
    fields<ɸ extends Schema>(schema: (field: Fields) => ɸ) {
      const fields = contextSchema(schema)
      return {
        superposition<𝛴 extends string>(superposition: Superposition<𝛴, ɸ>) {
          validateNoUnconditionalCycles(superposition)
          const symbolKeys = Object.getOwnPropertySymbols(superposition)
          const undefinedSymbol = symbolKeys.find((key) => String(key) === "Symbol()")
          const undefinedValue = superposition[undefinedSymbol as unknown as 𝛴]
          if (undefinedValue) {
            superposition["$undef$" as 𝛴] = undefinedValue
            delete superposition[undefinedSymbol as unknown as 𝛴]
          }
          return {
            mass<m extends Mass>(mass?: m) {
              return {
                processes(process: ProcessesDeclaration<ɸ, 𝛴, m> = () => ({})) {
                  const processes = processesSchema(process)
                  return {
                    reactions(reaction: ReactionsDeclaration<ɸ, 𝛴, m> = () => []) {
                      const reactions = reactionsSchema(reaction)
                      return {
                        bulk(bulk?: BulkDeclaration<ɸ, m, 𝛴>): Meta<ɸ, 𝛴, m> {
                          const schema: Meta<ɸ, 𝛴, m> = { name, superposition, fields, mass: mass || ({} as m) }
                          if (desc) schema.desc = desc
                          if (bulk && "view" in bulk) schema.view = serializeStyle(bulk.view as any)
                          if (bulk && "gravity" in bulk) schema.gravity = parse(bulk.gravity as any)
                          if (processes) schema.processes = processes
                          if (reactions) schema.reactions = reactions
                          return schema
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}
