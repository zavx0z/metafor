import "./windows.ts"
import { MetaForFabric } from "../core"
import { Store } from "./store"

const store = await Store()
MetaForFabric({ store })
export type { Message } from "../core/message/index"
export type {
  Schema as ContextSchema,
  Values as ContextValues,
  Update as ContextUpdate,
  Types as ContextTypes,
  SchemaType as ContextSchemaType,
  Snapshot as ContextSnapshot,
} from "@zavx0z/context"
