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
 * - Доступ к контексту в функции `filter`: `filter(({ self, context }) => ...)`
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
 *   .context((types) => ({
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
 *         const response = await fetch(`/api/users/${context.userId}`)
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
 *         .filter(({ self, context }) => ({
 *           meta: "user",
 *           atom: self.atom.split("/")[1] || "",
 *           value: { gt: 0 }
 *         }))
 *         .equal(({ update }) => update({ isLoading: true }))
 *     ]
 *   ])
 *   .view({
 *     render: ({ context, html, update }) => html`
 *       <div>
 *         <h1>${context.userName}</h1>
 *         <button @click=${() => update({ isLoading: true })}>
 *           Загрузить
 *         </button>
 *       </div>
 *     `
 *   })
 * ```
 *
 * @packageDocumentation
 */
import { contextSchema, type Schema, type Types } from "@zavx0z/context"
import { parse, type NodeLogical, type NodeMeta, type Node as NodeType } from "@zavx0z/template"
import type { Core } from "../atom/gravity.t"

import { validateNoUnconditionalCycles, type Superposition } from "./states"
import { reactionsSchema, type ReactionsDeclaration } from "./reactions"
import { processesSchema, type ProcessesDeclaration } from "./process"
import { serializeStyle } from "./style"

import type { MetaForConfig, MetaFor, ViewDeclaration, Meta } from "./metafor.t"
import type { Self } from "../atom/atom"

export type { MetaFor, Meta, Self, Superposition, NodeMeta, NodeType, NodeLogical }

globalThis.MetaFor = function (name: string, config?: MetaForConfig) {
  const desc = config?.desc
  const dev = config?.dev ?? globalThis.DEV ?? false
  return {
    context<C extends Schema>(schema: (types: Types) => C) {
      const context = contextSchema(schema)
      return {
        states<S extends string>(states: Superposition<S, C>) {
          validateNoUnconditionalCycles(states)
          const symbolKeys = Object.getOwnPropertySymbols(states)
          const undefinedSymbol = symbolKeys.find((key) => String(key) === "Symbol()")
          const undefinedValue = states[undefinedSymbol as unknown as S]
          if (undefinedValue) {
            states["$undef$" as S] = undefinedValue
            delete states[undefinedSymbol as unknown as S]
          }
          return {
            core<I extends Core>(core?: I) {
              return {
                processes(process: ProcessesDeclaration<C, S, I> = () => ({})) {
                  const processes = processesSchema(process)
                  return {
                    reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                      const reactions = reactionsSchema(reaction)
                      return {
                        view(view?: ViewDeclaration<C, I, S>): Meta<C, S, I> {
                          const schema: Meta<C, S, I> = { name, states, context, core: core || ({} as I) }
                          if (desc) schema.desc = desc
                          if (view && "style" in view) schema.style = serializeStyle(view.style)
                          if (view && "render" in view) schema.render = parse(view.render as any)
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
