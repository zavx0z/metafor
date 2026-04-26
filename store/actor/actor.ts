import type { DbInstanceStore as DbActorStore } from "@metafor/db"
import type { ActorStoreOrm } from "./actor.t"

export const createActorStoreOrm = (rows: DbActorStore): ActorStoreOrm => ({
    rows,
    clear: (rootSrc) => rows.clearWorld(rootSrc),
    insertParticle: (rootSrc, shell) => rows.insertParticleShell(rootSrc, shell),
    insertField: (rootSrc, orbit) => rows.insertFieldOrbit(rootSrc, orbit),
    particles: (rootSrc) => rows.selectAllParticleShells(rootSrc),
    fields: (rootSrc) => rows.selectAllFieldOrbits(rootSrc),
    children: (rootSrc, parentParticleId) => rows.selectParticleShellsByParent(rootSrc, parentParticleId),
    particleFields: (rootSrc, particleId) => rows.selectFieldOrbitsByParticle(rootSrc, particleId),
    async world(rootSrc) {
        const [particles, fields] = await Promise.all([
            rows.selectAllParticleShells(rootSrc),
            rows.selectAllFieldOrbits(rootSrc),
        ])
        return { rootSrc, particles, fields }
    },
})
