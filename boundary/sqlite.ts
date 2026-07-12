import {SQL} from "bun"
import {mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {BoundaryWimpSqlite} from "@boundary/wimp/sqlite"
import {BoundaryActorSqlite} from "@boundary/actor/sqlite"
import {BoundaryTopologySqlite} from "@boundary/topology/sqlite"
import type {ForceMessage} from "@metafor/types/force/message"
import {BoundaryIncrementalStore, type BoundaryIncrementalCommit} from "./incremental.ts"
import {BoundaryExecutionStore} from "./execution.ts"
import {BoundaryReactionStore} from "./reaction.ts"
import {BoundaryInputStore} from "./input.ts"
import {initBoundaryStateDeclarations} from "./state-declaration.ts"
import {matrixRuntime} from "./runtime/matrix.ts"

const isUncommittedFieldMutation = (message: ForceMessage): boolean => {
  const part = message.parts[0]
  return (part.part === "gluon" || part.part === "higgs") &&
    (part.op === "add" || part.op === "replace" || part.op === "remove") &&
    part.from === undefined
}

const stampBoundaryCommit = (
  input: ForceMessage,
  commit: BoundaryIncrementalCommit,
): BoundaryIncrementalCommit => {
  if (!isUncommittedFieldMutation(input)) return commit
  const commitId = `boundary:${crypto.randomUUID()}`
  return {
    ...commit,
    messages: commit.messages.map((message) => {
      const part = message.parts[0]
      if ((part.part !== "gluon" && part.part !== "higgs") || part.from !== undefined) return message
      return {parts: [{...part, from: commitId}]}
    }),
  }
}

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
  const execution = new BoundaryExecutionStore(sql)
  await execution.init()
  const reaction = new BoundaryReactionStore(sql)
  await reaction.init()
  const input = new BoundaryInputStore(sql)
  let absorbQueue: Promise<unknown> = Promise.resolve()

  const materialize = (message: ForceMessage): Promise<BoundaryIncrementalCommit | null> => {
    const task = absorbQueue.then(async () => {
      const executionCommit = await execution.apply(message)
      const reactionCommit = await reaction.apply(message)
      const inputCommit = await input.apply(message)
      const rawCommit = executionCommit !== undefined
        ? executionCommit
        : reactionCommit !== undefined
          ? reactionCommit
          : inputCommit !== undefined
            ? inputCommit
            : await projection.apply(message)
      if (!rawCommit) return null

      const commit = stampBoundaryCommit(message, rawCommit)
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
    execution,
    reaction,
    input,
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
