import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."
import { getFields } from "./fields/get.ts"
import { getMass, getMetaRow, hasMatter, hasProcesses, hasReactions } from "./metafor/get.ts"
import { getMatterParticles } from "./matter/get.ts"
import { getProcesses } from "./process/get.ts"
import { getReactions } from "./reactions/get.ts"
import { getSuperposition } from "./superposition/get.ts"
import type { DarkMetaParticleModel } from "./read.t.ts"

const hasKeys = (value: object): boolean => Object.keys(value).length > 0

export const readDarkParticleModel = (db: Database, src: string): DarkMetaParticleModel => {
  const metaRow = getMetaRow(db, src)

  if (!metaRow) {
    throw new Error(`Canonical meta "${src}" is not found in SQLite`)
  }

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
