import "../schema/index"
import { actorFabric } from "../core"
import { Store } from "./store"
import type { RenderParams } from "@zavx0z/renderer"
import type { Schema } from "@zavx0z/context"
import type { Core } from "@zavx0z/template"

const store = await Store()
const renderer = (params: RenderParams<Schema, Core, string>) => {
  // const { schema } = params.ctx
  // console.log(schema)
}
const space = async (src: string) => await actorFabric({ store, env: "srv:m", renderer, src })

export { space }
export type { Message } from "../core"
