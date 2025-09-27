import "../schema/index"
import { Actor } from "../core"
import { Store } from "./store"

const store = await Store()
const renderer: any = () => {}
const space = async (src: string) => await Actor.create({ store, env: "srv:m", renderer, src })

export { space }
export type { Message } from "../core"
