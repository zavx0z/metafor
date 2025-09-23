/**
 * Web-реализация MetaFor фреймворка
 *
 * Этот модуль экспортирует MetaFor для использования в браузере.
 * Компоненты автоматически регистрируются с тегами вида `meta-<hash>`.
 *
 * @example
 * ```typescript
 * import { MetaFor } from "./web/metafor.ts"
 *
 * const hash = MetaFor("my-component")
 *   .context(...)
 *   .states(...)
 *   .core(...)
 *   .processes(...)
 *   .reactions(...)
 *   .view(...)
 *
 * // Создание элемента
 * document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
 * ```
 */
import { Store } from "./store"
import { MetaForFabric } from "../core"

const store = await Store()
MetaForFabric({ store })
export type { Message } from "../core/message/index"
export type {
  Schema as ContextSchema,
  Values as ContextValues,
  Update as ContextUpdate,
  Types as ContextTypes,
  SchemaType as ContextSchemaType,
  Snapshot as ContextSnapshot,
} from "@zavx0z/context"
export type { Node as ParsedNode } from "@zavx0z/template"
