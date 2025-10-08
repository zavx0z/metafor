/**
 * MetaFor - фреймворк для создания актора конечного автомата
 *
 * MetaFor предоставляет декларативный способ создания web-компонентов с конечным автоматом.
 * Каждый компонент имеет типизированный контекст, состояния, процессы, реакции и представление.
 *
 * **ВАЖНО: Акторы MetaFor имеют полную изоляцию и используют shadow-dom closed**
 * Все взаимодействия между акторами происходят через патчи в сообщениях
 * Акторы регистрируются автоматически при импорте файла, экспорт не требуется
 * Используйте систему сообщений и реакций для связи между компонентами
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
import { parse } from "@zavx0z/template"
import type { Core } from "../core/index.t"

import { validateNoUnconditionalCycles, type StatesConfig } from "./states"
import { reactionsSchema, type ReactionsDeclaration } from "./reactions"
import { processesSchema, type ProcessesDeclaration } from "./process"
import { serializeStyle } from "./style"

import type { MetaForConfig, MetaForType, ViewDeclaration, MetaSchema } from "./index.t"
export type { MetaForType, MetaSchema }

function schema(name: string, config?: MetaForConfig) {
  const description = config?.description
  const dev = config?.dev ?? globalThis.DEV ?? false
  return {
    context<C extends Schema>(schema: (types: Types) => C) {
      const context = contextSchema(schema)
      return {
        states<S extends string>(states: StatesConfig<S, C>) {
          validateNoUnconditionalCycles(states)
          return {
            core<I extends Core>(coreBuilder: (() => I) | I = () => ({}) as I) {
              const core = typeof coreBuilder === "function" ? coreBuilder() : coreBuilder
              return {
                processes(process: ProcessesDeclaration<C, S, I> = () => ({})) {
                  const processes = processesSchema(process)
                  return {
                    reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                      const reactions = reactionsSchema(reaction)
                      return {
                        view(view?: ViewDeclaration<C, I, S>): MetaSchema<C, S> {
                          const schema: MetaSchema<C, S> = { name, states, context }
                          if (description) schema.description = description
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

globalThis.MetaFor = schema
