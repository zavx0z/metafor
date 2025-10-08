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
import { actorFabric } from "../fabric"
import type { RenderParams } from "@zavx0z/renderer"
import type { Schema } from "@zavx0z/context"
import type { Core } from "@zavx0z/template"

const store = await Store()
const renderer = (params: RenderParams<Schema, Core, string>) => {
  //   const { schema } = params.ctx
  //   console.log(params)
}
const space = async (src: string) => await actorFabric({ store, env: "web:m", renderer, src })

export { space }
export type { Message } from "../core"
