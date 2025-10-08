import type { Schema } from "@zavx0z/context"
import type { RenderParams } from "@zavx0z/renderer"

import type { Core } from "./core/index.t"
import type { Store } from "./core/store.t"

export type Env = "srv:m" | "srv:w" | "web:m" | "web:w" | "web:sw"

export type ActorFabricParam = {
  store: Store
  src: string
  env: Env
  renderer: (params: RenderParams<Schema, Core, string>) => void
}
