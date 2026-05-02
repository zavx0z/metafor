import type { SQL } from "bun"
import type { MetaDSL } from "../../.."
import type { WimpSource } from "./wimp.t.ts"
import { insertMassValue } from "./mass.C.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export async function createWimp(sql: SQL, meta: MetaDSL, src: WimpSource): Promise<void> {
  if (meta.mass !== undefined && !isRecord(meta.mass)) {
    throw new Error(`Meta mass for "${src}" must be an object to be stored in relational form`)
  }

  await sql`
    INSERT INTO wimp (src, name, desc, view_css)
    VALUES (${src}, ${meta.name}, ${meta.desc || null}, ${meta.bulk?.view || null})
  `

  if (meta.mass !== undefined) {
    await insertMassValue(sql, src, meta.mass, null, null, null)
  }
}
