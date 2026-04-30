import type { SQL } from "bun"
import type { MetaDSL } from "../metafor.t.ts"
import type { Meta } from "@store/meta"
import type { Actor, ActorRoots, ActorRows, Value } from "@store/actor"
import type { ActorRecord, ActorValueRecord } from "@store/actor"

export interface MetaApi {
  create(src: string, dsl: MetaDSL): Promise<Meta>
  get(src: string): Promise<Meta | null>
  delete(src: string): Promise<void>
}

export interface ActorApi {
  create(rows: ActorRows): Promise<Actor>
  get(uuid: string): Promise<Actor | null>
  delete(uuid: string): Promise<void>
  head(uuid: string): Promise<ActorRecord | null>
  readonly roots: ActorRoots
  readonly value: ValueApi
  readonly link: LinkApi
}

export interface ValueApi {
  get(uuid: string): Promise<Value | null>
}

export interface LinkApi {
  get(actor: string, field: string): Promise<ActorValueRecord | null>
  share(actor: string, field: string, value: string): Promise<void>
  fork(actor: string, field: string): Promise<string>
}

export interface ServerStore {
  readonly sql: SQL
  readonly meta: MetaApi
  readonly actor: ActorApi
  close(): Promise<void>
}
