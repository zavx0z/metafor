import type { DbActorStore } from "./store.t"
import type { DbFieldOrbitRow, DbParticleShellRow, DbWorldRows } from "./types.t"

export interface ActorStoreOrm {
  readonly backend: DbActorStore
  clear(rootSrc: string): Promise<void>
  insertParticle(rootSrc: string, shell: DbParticleShellRow): Promise<void>
  insertField(rootSrc: string, orbit: DbFieldOrbitRow): Promise<void>
  particles(rootSrc: string): Promise<DbParticleShellRow[]>
  fields(rootSrc: string): Promise<DbFieldOrbitRow[]>
  children(rootSrc: string, parentParticleId: string | null): Promise<DbParticleShellRow[]>
  particleFields(rootSrc: string, particleId: string): Promise<DbFieldOrbitRow[]>
  world(rootSrc: string): Promise<DbWorldRows>
}
