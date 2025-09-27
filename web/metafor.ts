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
import "../schema/index"
import { Store } from "./store"
import { Actor } from "../core"

const store = await Store()
const renderer: any = () => {}
const space = async (src: string) => await Actor.create({ store, env: "web:m", renderer, src })

export { space }
export type { Message } from "../core"
