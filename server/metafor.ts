import "./windows.ts"
import "../schema/index"
import { MetaForFabric } from "../core"
import { Store } from "./store"
import { render } from "@zavx0z/renderer"

const store = await Store()
MetaForFabric({ store, render, env: "srv:m" })
export type { Message } from "../core/index.t"
