import type { MatterContinuation } from "@dark/types/dark"
import type { SharedDbMaterializationWriter } from "@shared/db"
import { emitBarrier } from "@dark/gravity/channel.ts"
import { matterMeta } from "./dark.ts"
import { ensureMetaCanonicalized } from "./load.ts"
import { Wimp } from "./strong"

interface MatterOptions {
  sharedDbWriter?: SharedDbMaterializationWriter
  suppressGravityBarrier?: boolean
}

/**
 * Публичный entrypoint Dark:
 * `load(one meta) -> relation(one meta) -> matterMeta(from SQLite)` с рекурсивным обходом дочерних meta.
 */
export async function matter(
  wimp: Wimp,
  continuation?: MatterContinuation,
  options: MatterOptions = {},
): Promise<void> {
  const sqlite = await ensureMetaCanonicalized(wimp.src)
  if (!sqlite) {
    throw new Error(`Canonical SQLite context is unavailable for "${wimp.src}"`)
  }

  const shouldEmitGravityBarrier = options.suppressGravityBarrier !== true
  const nestedOptions = shouldEmitGravityBarrier ? { ...options, suppressGravityBarrier: true } : options
  const generator = matterMeta(wimp, continuation, {
    ...options,
    sqliteDb: sqlite.db,
  })

  for await (const wimps of generator) {
    for (const [childWimp, childContinuation] of wimps) {
      await matter(childWimp, childContinuation, nestedOptions)
    }
  }

  if (shouldEmitGravityBarrier) {
    emitBarrier()
  }
}

export { matterMeta } from "./dark.ts"
