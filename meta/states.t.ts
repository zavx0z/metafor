import type { Schema } from "@zavx0z/context"
import type { Transitions } from "../atom/src/states.t"

export type Superposition<S extends string = string, C extends Schema = Schema> = Record<S, Transitions<S, C>>
