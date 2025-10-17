import type { Schema } from "@zavx0z/context"
import type { Transitions } from "../actor/src/states.t"

/**ƒ
 * Конфигурация состояний
 *
 * @includeExample ./state/test/states.config.basic.spec.ts
 * @includeExample ./state/test/states.config.order.spec.ts
 * @includeExample ./state/test/states.config.numeric.spec.ts
 * @includeExample ./state/test/states.config.multiple.spec.ts
 */

export type StatesConfig<S extends string = string, C extends Schema = Schema> = Record<S, Transitions<S, C>>
