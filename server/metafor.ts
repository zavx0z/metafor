import "./windows.ts"
import { MetaForFabric } from "../core"
import { Store } from "./store"

export const store = await Store()
export const MetaFor = MetaForFabric({ store })
;(window as any).MetaFor = MetaFor
export type { Message } from "../core/message/index"
