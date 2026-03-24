import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import { createSharedDbDataFromWimpBundles, type SharedDbData } from "@shared/db"

/**
 * Собирает плоский список всех `Wimp`, достижимых от корня.
 *
 * Обход идёт по `children`, поэтому в shared/db попадают только уже materialized
 * частицы, а topology-частицы служат мостами к дочерним `Wimp`.
 */
const collectReachableWimps = (root: Wimp): Wimp[] => {
  const ordered: Wimp[] = []
  const stack: DarkParticle[] = [root]
  const seenParticleIds = new Set<string>()

  while (stack.length > 0) {
    const particle = stack.pop()
    if (!particle || seenParticleIds.has(particle.id)) continue
    seenParticleIds.add(particle.id)

    if (particle instanceof Wimp) {
      ordered.push(particle)
    }

    const children = Array.from(particle.children)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child) stack.push(child)
    }
  }

  return ordered
}

/**
 * Строит канонический relational shared/db snapshot из полностью materialized `Dark`-графа.
 *
 * Полный snapshot использует тот же Wimp-level bundle,
 * что и поэтапный materialization write path.
 */
export const assembleSharedDbData = (root: Wimp): SharedDbData =>
  createSharedDbDataFromWimpBundles(collectReachableWimps(root).map((wimp) => wimp.toSharedDbBundle()))
