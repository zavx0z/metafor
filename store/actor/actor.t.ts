import type { DbInstanceStore as DbActorStore, DbParticleShellRow, DbFieldOrbitRow, DbWorldRows } from "@metafor/db";

export interface ActorStoreOrm {
  readonly rows: DbActorStore
  clear(rootSrc: string): Promise<void>
  insertParticle(rootSrc: string, shell: DbParticleShellRow): Promise<void>
  insertField(rootSrc: string, orbit: DbFieldOrbitRow): Promise<void>
  particles(rootSrc: string): Promise<DbParticleShellRow[]>
  fields(rootSrc: string): Promise<DbFieldOrbitRow[]>
  children(rootSrc: string, parentParticleId: string | null): Promise<DbParticleShellRow[]>
  particleFields(rootSrc: string, particleId: string): Promise<DbFieldOrbitRow[]>
  world(rootSrc: string): Promise<DbWorldRows>
}
