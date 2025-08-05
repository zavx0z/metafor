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

import { MetaForFabric } from "../core"
import { IndexedDBStore } from "./store"

export const store = new IndexedDBStore()
export const MetaFor = MetaForFabric({ store })
export type { Message } from "../core/message/index"
