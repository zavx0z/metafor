import "./windows.ts"
import { MetaForFabric } from "../core"
import { Store } from "./store"

const store = await Store()
MetaForFabric({ store })
export type { Message } from "../core/message/index"
