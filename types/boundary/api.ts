import type { Actor, ActorFieldValue, ActorRoots } from "@boundary/actor"
import type { Value } from "@boundary/actor/sqlite/value"
import type { TopologyBase } from "@boundary/topology/sqlite/topology"
import type { Wimp } from "@boundary/wimp/sqlite"
import type { BulkRuntimeSnapshot } from "../bulk/runtime.ts"
import type { EnergyRuntimeSnapshot } from "../energy/catalog.ts"
import type { ForceSurface } from "../force/channel.ts"
import type { MatrixRuntimeSnapshot } from "../matrix/runtime.ts"
import type { ActorRecord, ActorRows } from "./actor.ts"
import type { TopologyInput, TopologyRecord } from "./topology.ts"
import type { WimpCreateInput } from "./wimp.ts"

export interface WimpApi {
  exists(src: string): Promise<boolean>
  create(src: string, input?: WimpCreateInput): Promise<Wimp>
  get(src: string): Promise<Wimp | null>
}

export interface ValueApi {
  get(id: number): Promise<Value | null>
}

export interface LinkApi {
  get(actor: number, field: number): Promise<ActorFieldValue | null>
}

export interface ActorApi {
  create(rows: ActorRows): Promise<Actor>
  get(id: number): Promise<Actor | null>
  findByParent(input: {
    wimp: string
    parent: {kind: "actor"; id: number} | {kind: "topology"; id: number} | null
  }): Promise<Actor | null>
  head(id: number): Promise<ActorRecord | null>
  readonly roots: ActorRoots
  readonly value: ValueApi
  readonly link: LinkApi
}

export interface TopologyApi {
  create(input: TopologyInput): Promise<TopologyBase>
  get(id: number): Promise<TopologyBase | null>
  head(id: number): Promise<TopologyRecord | null>
  childrenOfActor(actorId: number): Promise<TopologyBase[]>
}

export interface Boundary extends ForceSurface {
  readonly wimp: WimpApi
  readonly actor: ActorApi
  readonly topology: TopologyApi
  bulkRuntime(): Promise<BulkRuntimeSnapshot>
  matrixRuntime(): Promise<MatrixRuntimeSnapshot>
  energyRuntime(): Promise<EnergyRuntimeSnapshot>
  close(): Promise<void>
}
