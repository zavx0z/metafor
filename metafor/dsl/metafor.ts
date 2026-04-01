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
 * - Доступ к параметрам в функции `filter`: `filter(({ self, value }) => ...)`
 * - Декларативные условия фильтрации с поддержкой сложных условий
 * - Фильтрация по meta, atom, path, op, value, timestamp
 *
 * ### Иерархия атомов
 * - `Fields` для управления позиционными путями
 * - Автоматическая генерация корневых путей
 * - Управление иерархией VDOM
 *
 * ### Шаблонизация
 * - Использует `@metafor/template` для рендеринга
 * - Поддержка JavaScript выражений в template literals
 * - Типобезопасный template API
 *
 * @example
 * ```typescript
 * export default MetaFor("user-profile")
 *   .fields((field) => ({
 *     mode: field.enum("summary", "details").required("summary"),
 *     userId: field.number.required(0),
 *   }))
 *   .superposition({
 *     idle: { loaded: { mode: { null: false } } },
 *     loaded: null,
 *   })
 *   .mass({ users: [] })
 *   .processes((process) => ({
 *     loadUser: process()
 *       .action(async ({ value }) => {
 *         const response = await fetch(`/api/users/${value.userId}`)
 *         return await response.json()
 *       })
 *       .success(({ update }) => update({ mode: "details" }))
 *   }))
 *   .reactions((reaction) => [
 *     [
 *       ["idle"],
 *       reaction()
 *         .filter(({ self, value }) => ({
 *           meta: "user",
 *           atom: self.atom.split("/")[1] || "",
 *           value: { gt: 0 }
 *         }))
 *         .equal(({ update }) => update({ mode: "details" }))
 *     ]
 *   ])
 *   .matter(({ state, value, html }) => html`
 *     ${state === "idle" && html`<meta-for src="demo/user-spinner" />`}
 *     ${value.mode === "summary"
 *       ? html`<meta-for src="demo/user-summary" fields=${{ userId: value.userId }} />`
 *       : html`<meta-for src="demo/user-details" fields=${{ userId: value.userId }} />`}
 *   `)
 *   .bulk()
 * ```
 *
 * @packageDocumentation
 */
import { fieldSchema } from "./fields.ts"
import type { Schema, Types as Fields } from "./fields.t.ts"
import { parse } from "../template/index.ts"

import { validateNoUnconditionalCycles } from "./states"
import type { Superposition } from "./states.t"
import { reactionsSchema } from "./reactions"
import type { ReactionsDeclaration } from "./reactions.t"
import { processesSchema } from "./process"
import type { ProcessesDeclaration } from "./process.t"
import { serializeStyle } from "./style"

import type {
  MetaForConfig,
  BulkDeclaration,
  MatterDeclaration,
  MetaDSL,
  Mass,
  MetaForFn,
} from "./metafor.t"

export const MetaFor: MetaForFn = function (name: string, config?: MetaForConfig) {
  const desc = config?.desc
  const dev = config?.dev ?? globalThis.DEV ?? false
  return {
    fields<ɸ extends Schema>(schema: (field: Fields) => ɸ) {
      const fields = fieldSchema(schema)
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
              const schema: MetaDSL<ɸ, 𝛴, m> = {
                name,
                superposition,
                fields: fields,
                mass: mass || ({} as m),
              }
              if (desc) schema.desc = desc
              return {
                processes(process: ProcessesDeclaration<ɸ, 𝛴, m> = () => ({})) {
                  const processes = processesSchema(process)
                  if (processes) schema.processes = processes
                  return {
                    reactions(reaction: ReactionsDeclaration<ɸ, 𝛴, m> = () => []) {
                      const reactions = reactionsSchema(reaction)
                      if (reactions) schema.reactions = reactions
                      return {
                        matter(matter?: MatterDeclaration<ɸ, m, 𝛴>) {
                          if (matter) schema.matter = parse(matter as any)
                          return {
                            bulk(bulk?: BulkDeclaration): MetaDSL<ɸ, 𝛴, m> {
                              if (bulk && "view" in bulk) schema.view = serializeStyle(bulk.view as any)
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
    },
  }
}
