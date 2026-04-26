import type { SQL } from "bun"
import type { MetaDSL } from "../../.."
import { getFields } from "./fields.G.ts"
import { getMass, getMetaRow, hasMatter, hasProcesses, hasReactions } from "./meta.G.ts"
import { getMatterParticles } from "./matter.G.ts"
import { getProcesses } from "./process.G.ts"
import { getReactions } from "./reactions.G.ts"
import { getSuperposition } from "./superposition.G.ts"
import type { DarkMetaParticleModel } from "./read.t.ts"

const hasKeys = (value: object): boolean => Object.keys(value).length > 0

export const readDarkParticleModel = async (sql: SQL, src: string): Promise<DarkMetaParticleModel | null> => {
  const metaRow = await getMetaRow(sql, src)

  if (!metaRow) return null

  const { fields, fieldKeys, enumVariants } = await getFields(sql, src)
  const metaMass = await getMass(sql, src)
  const superposition = await getSuperposition(sql, src, enumVariants)
  const processes = (await hasProcesses(sql, src)) ? ((await getProcesses(sql, src, fieldKeys)) ?? {}) : undefined
  const reactionsExist = await hasReactions(sql, src)
  const reactions = reactionsExist ? ((await getReactions(sql, src, fieldKeys)) ?? { reactions: {}, superposition: {} }) : undefined

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
    particles: (await hasMatter(sql, src)) ? await getMatterParticles(sql, src) : [],
  }
}
