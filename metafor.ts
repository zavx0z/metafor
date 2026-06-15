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
 *   .processes((process) => [
 *     process("loading")
 *       .action(async ({ value }) => {
 *         const response = await fetch(`/api/users/${value.userId}`)
 *         return await response.json()
 *       })
 *       .success(({ update }) => update({ mode: "details" }))
 *   ])
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
import type { Fields, Field } from "./fields.t.ts"
import { parseMatter } from "./matter.ts"

import { validateNoUnconditionalCycles } from "./superposition.ts"
import type { SuperpositionInput, SuperpositionInputCheck, SuperpositionStateKeys } from "./superposition.t.ts"
import { reactionsSchema } from "./reactions.ts"
import type { ReactionsDeclaration } from "./reactions.t.ts"
import { processesSchema } from "./process.ts"
import type { ProcessesDeclaration } from "./process.t.ts"
import { serializeStyle } from "./style.ts"
import type { MatterDeclaration } from "./matter.t.ts"

import type { MetaForConfig, BulkDeclaration, MetaDSL, BulkSchema, Mass } from "./metafor.t.ts"

globalThis.MetaFor = function (name: string, config?: MetaForConfig) {
  const desc = config?.desc
  const dev = config?.dev ?? globalThis.DEV ?? false
  return {
    fields<ɸ extends Fields>(schema: (field: Field) => ɸ) {
      const fields = fieldSchema(schema)
      return {
        superposition<const ψ extends Record<string, unknown>>(
          superposition: ψ,
          ..._check: SuperpositionInputCheck<ɸ, ψ>
        ) {
          type 𝛴 = SuperpositionStateKeys<ψ>
          const normalizedSuperposition = superposition as SuperpositionInput<ɸ, ψ>
          validateNoUnconditionalCycles(normalizedSuperposition)
          const symbolKeys = Object.getOwnPropertySymbols(normalizedSuperposition)
          const undefinedSymbol = symbolKeys.find((key) => String(key) === "Symbol()")
          const undefinedValue = normalizedSuperposition[undefinedSymbol as unknown as 𝛴]
          if (undefinedValue) {
            normalizedSuperposition["$undef$" as 𝛴] = undefinedValue
            delete normalizedSuperposition[undefinedSymbol as unknown as 𝛴]
          }
          return {
            mass<m extends Mass>(mass?: m) {
              const dslFields = Object.entries(fields).map(([key, definition]) => ({key, ...definition}))
              const dslSuperposition = Object.entries(normalizedSuperposition).map(([name, transitions]) => ({name, transitions}))
              const schema: MetaDSL<ɸ, 𝛴, m> = {
                name,
                superposition: dslSuperposition,
                fields: dslFields,
                mass: mass || ({} as m),
              }
              if (desc) schema.desc = desc
              return {
                processes(process: ProcessesDeclaration<ɸ, 𝛴, m, ψ> = () => []) {
                  const processes = processesSchema(process)
                  if (processes) {
                    schema.processes = Object.entries(processes).map(([key, declaration]) => ({key, declaration}))
                  }
                  return {
                    reactions(reaction: ReactionsDeclaration<ɸ, 𝛴, m> = () => []) {
                      const reactions = reactionsSchema(reaction)
                      if (reactions) {
                        schema.reactions = Object.entries(reactions.reactions).map(([key, config]) => ({
                          key,
                          label: config.label,
                          desc: config.desc ?? null,
                          cond: config.cond,
                          src: config.src,
                          read: config.read ?? [],
                          write: config.write ?? [],
                          states: Object.entries(reactions.superposition)
                            .filter(([, reactionIds]) => reactionIds.includes(key))
                            .map(([state]) => state),
                        }))
                      }
                      return {
                        matter(matter?: MatterDeclaration<ɸ, m, 𝛴>) {
                          if (matter) schema.matter = parseMatter(matter, fields, name)
                          return {
                            bulk(bulk?: BulkDeclaration): MetaDSL<ɸ, 𝛴, m> {
                              if (bulk && "view" in bulk) {
                                schema.bulk = { view: serializeStyle(bulk.view as any) } as BulkSchema
                              }
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
export const MetaFor = globalThis.MetaFor
