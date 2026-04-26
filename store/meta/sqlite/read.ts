import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."
import { getFields } from "./fields.G.ts"
import { getMass, getMetaRow, hasMatter, hasProcesses, hasReactions } from "./meta.G.ts"
import { getMatterParticles } from "./matter.G.ts"
import { getProcesses } from "./process.G.ts"
import { getReactions } from "./reactions.G.ts"
import { getSuperposition } from "./superposition.G.ts"
import type { DarkMetaParticleModel } from "./read.t.ts"

const hasKeys = (value: object): boolean => Object.keys(value).length > 0

export const readDarkParticleModel = (db: Database, src: string): DarkMetaParticleModel | null => {
  const metaRow = getMetaRow(db, src)

  if (!metaRow) return null

  const { fields, fieldKeys, enumVariants } = getFields(db, src)
  const metaMass = getMass(db, src)
  const superposition = getSuperposition(db, src, enumVariants)
  const processes = hasProcesses(db, src) ? (getProcesses(db, src, fieldKeys) ?? {}) : undefined
  const reactionsExist = hasReactions(db, src)
  const reactions = reactionsExist ? (getReactions(db, src, fieldKeys) ?? { reactions: {}, superposition: {} }) : undefined

  return {
    meta: {
      src,
      name: metaRow.name ?? src.split("/").pop() ?? src,
      fieldSchemas: fields,
      superposition: superposition ?? {},
      ...(processes !== undefined ? { processes } : {}),
      ...(reactions !== undefined ? { reactions } : {}),
      ...(metaRow.view_css !== null ? { bulk: { view: metaRow.view_css } as MetaDSL["bulk"] } : {}),
      ...(metaMass !== undefined && hasKeys(metaMass) ? { mass: metaMass } : {}),
    },
    particles: hasMatter(db, src) ? getMatterParticles(db, src) : [],
  }
}
