import {SQL} from "bun"
import {mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {BoundaryWimpSqlite} from "@boundary/wimp/sqlite"
import {BoundaryActorSqlite} from "@boundary/actor/sqlite"
import {BoundaryTopologySqlite} from "@boundary/topology/sqlite"
import type {ForceMessage} from "@metafor/types/force/message"
import {BoundaryIncrementalStore, type BoundaryIncrementalCommit} from "./incremental.ts"
import {BoundaryExecutionStore} from "./execution.ts"
import {BoundaryInputStore} from "./input.ts"
import {BoundaryReactionStore} from "./reaction.ts"
import {initBoundaryStateDeclarations} from "./state-declaration.ts"
import {matrixRuntime} from "./runtime/matrix.ts"

export const open = async (filename?: string) => {
  const fileBacked = filename !== undefined && filename !== ":memory:"
  if (fileBacked) mkdirSync(dirname(filename), {recursive: true})

  const sql = new SQL(fileBacked ? `sqlite://${filename}` : "sqlite::memory:")
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  // Topology precedes actor because both tables reference each other.
  const topology = await BoundaryTopologySqlite.open(sql)
  const actor = await BoundaryActorSqlite.open(sql)
  const wimp = await BoundaryWimpSqlite.open(sql)
  const projection = new BoundaryIncrementalStore(sql)
  await projection.init()
  await initBoundaryStateDeclarations(sql)
  const input = new BoundaryInputStore(sql)
  await input.init()
  const execution = new BoundaryExecutionStore(sql)
  await execution.init()
  const reaction = new BoundaryReactionStore(sql)
  await reaction.init()
  let absorbQueue: Promise<unknown> = Promise.resolve()

  const materialize = (message: ForceMessage): Promise<BoundaryIncrementalCommit | null> => {
    const task = absorbQueue.then(async () => {
      const inputCommit = await input.apply(message)
      const executionCommit = inputCommit === undefined ? await execution.apply(message) : undefined
      const reactionCommit = inputCommit === undefined && executionCommit === undefined
        ? await reaction.apply(message)
        : undefined
      const commit = inputCommit !== undefined
        ? inputCommit
        : executionCommit !== undefined
          ? executionCommit
          : reactionCommit !== undefined
            ? reactionCommit
            : await projection.apply(message)
      if (!commit) return null

      const reactionSignals = await reaction.derive(commit.messages)
      return reactionSignals.length === 0
        ? commit
        : {...commit, messages: [...commit.messages, ...reactionSignals]}
    })
    absorbQueue = task.then(() => undefined, () => undefined)
    return task
  }

  return {
    wimp,
    actor,
    topology,
    projection,
    input,
    execution,
    reaction,
    replay: () => projection.replay(),
    materialize,
    matrixRuntime: () => matrixRuntime(sql),
    async close() {
      try {
        if (fileBacked) await sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE);")
        await sql.close()
      } catch {
        // close is intentionally idempotent
      }
    },
  }
}

export type BoundaryDatabase = Awaited<ReturnType<typeof open>>
