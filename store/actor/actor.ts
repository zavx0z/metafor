import type { DbActorStore } from "./store.t"
import type { ActorStoreOrm } from "./actor.t"

export const createActorStoreOrm = (backend: DbActorStore): ActorStoreOrm => ({
  backend,
  clear: (rootSrc) => backend.clearWorld(rootSrc),
  insertParticle: (rootSrc, shell) => backend.insertParticleShell(rootSrc, shell),
  insertField: (rootSrc, orbit) => backend.insertFieldOrbit(rootSrc, orbit),
  particles: (rootSrc) => backend.selectAllParticleShells(rootSrc),
  fields: (rootSrc) => backend.selectAllFieldOrbits(rootSrc),
  children: (rootSrc, parentParticleId) => backend.selectParticleShellsByParent(rootSrc, parentParticleId),
  particleFields: (rootSrc, particleId) => backend.selectFieldOrbitsByParticle(rootSrc, particleId),
  async world(rootSrc) {
    const [particles, fields] = await Promise.all([
      backend.selectAllParticleShells(rootSrc),
      backend.selectAllFieldOrbits(rootSrc),
    ])
    return { rootSrc, particles, fields }
  },
})
