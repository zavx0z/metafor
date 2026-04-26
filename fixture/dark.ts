import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import { openDbMaterializationWriter, openDbSqliteBackend, type DbData } from "../pkg/db/index.ts"
import { readDbSqliteData } from "../pkg/db/fixture.ts"

/**
 * Собирает плоский список всех `Wimp`, достижимых от корня.
 *
 * Обход идёт по `children`, поэтому в DB попадают только уже materialized
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
 * Легаси-helper для сравнения canonical DB rows в тестах и отладке.
 *
 * Helper использует тот же row-group writer, что и активный storage flow, чтобы
 * не поддерживать второй путь materialization ради тестов.
 */
export const assembleDbData = async (root: Wimp): Promise<DbData> => {
  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)

  try {
    for (const wimp of collectReachableWimps(root)) {
      await wimp.save(writer)
    }

    return readDbSqliteData(backend.database)
  } finally {
    backend.close()
  }
}
