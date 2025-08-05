import "./windows.ts"
import { MetaForFabric } from "../core"
import { SQLiteStore } from "./store"

export const store = new SQLiteStore()
export const MetaFor = MetaForFabric({ store })
export type { Message } from "../core/message/index"
