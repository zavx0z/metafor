import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import { createSharedDbProjectionFromWimpTraces, type SharedDbProjection } from "@shared/db"

/**
 * Собирает плоский список всех `Wimp`, достижимых от корня.
 *
 * Обход идёт по `children`, поэтому в shared/db попадают только уже materialized
 * частицы, а topology-частицы служат мостами к дочерним `Wimp`.
 */
const collectReachableWimps = (root: Wimp): Wimp[] => {
  const ordered: Wimp[] = []
  const queue: DarkParticle[] = [root]
  const seenParticleIds = new Set<string>()

  while (queue.length > 0) {
    const particle = queue.shift()
    if (!particle || seenParticleIds.has(particle.id)) continue
    seenParticleIds.add(particle.id)

    if (particle instanceof Wimp) {
      ordered.push(particle)
    }

    for (const child of particle.children) {
      queue.push(child)
    }
  }

  return ordered
}

/**
 * Строит общую плоскую DB-проекцию из полностью materialized `Dark`-графа.
 *
 * Полный snapshot теперь использует тот же Wimp-level DB-shaped trace,
 * что и новый поэтапный materialization write path.
 */
export const assembleSharedDbProjection = (root: Wimp): SharedDbProjection =>
  createSharedDbProjectionFromWimpTraces(collectReachableWimps(root).map((wimp) => wimp.toSharedDbTrace()))
