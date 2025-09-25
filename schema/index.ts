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
import { type Schema, type Types, contextSchema } from "@zavx0z/context"
import { parse } from "@zavx0z/template"
import type { MetaForConfig, Core, MetaSchema } from "../core/index.t"
import { type ProcessesDeclaration } from "../core/proc"
import { type ReactionsDeclaration, serializeReaction } from "../core/react"
import { type StatesConfig, validateNoUnconditionalCycles } from "../core/state"
import { type ViewDeclaration, serializeStyle } from "../core/view"
import { serializeProcesses } from "./process"

globalThis.MetaFor = function (name: string, config?: MetaForConfig) {
  const description = config?.description
  const dev = config?.dev ?? globalThis.DEV ?? false
  const persist = config?.persist ?? false
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
                  const processSchema = serializeProcesses(process)
                  return {
                    reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                      const reactionsSchema = serializeReaction(reaction)
                      return {
                        view(view?: ViewDeclaration<C, I, S>): MetaSchema<C, S> {
                          const metaSchema: MetaSchema<C, S> = { name, states, context }
                          if (description) metaSchema.description = description
                          if (view && "style" in view) metaSchema.style = serializeStyle(view.style)
                          if (view && "render" in view) metaSchema.render = parse(view.render as any)
                          if (processSchema) metaSchema.processes = processSchema
                          if (reactionsSchema) metaSchema.reactions = reactionsSchema
                          return metaSchema
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
