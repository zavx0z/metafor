import "./windows.ts"
import "../schema/index"
import { Actor } from "../core"
import { Store } from "./store"

const store = await Store()
const renderer: any = () => {}
Actor.create({ store, env: "srv:m", renderer, src: "/zavx0z/app.js" })
export type { Message } from "../core"
