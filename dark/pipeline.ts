import type { MatterContinuation } from "@dark/types/dark"
import type { SharedDbMaterializationWriter } from "@shared/db"
import { emitBarrier } from "@dark/gravity/channel.ts"
import { matterMeta } from "./dark.ts"
import { ensureMetaCanonicalized } from "./load.ts"
import { Wimp } from "./strong"

interface MatterPipelineOptions {
  sharedDbWriter?: SharedDbMaterializationWriter
  suppressGravityBarrier?: boolean
}

/**
 * Верхний dark-pipeline:
 * канонизирует по одной meta через load-layer и materialize-ит topology уже из prepared SQLite rows.
 */
export async function matter(
  wimp: Wimp,
  continuation?: MatterContinuation,
  options: MatterPipelineOptions = {},
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
