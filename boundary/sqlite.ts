import {SQL} from "bun"
import {mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {BoundaryWimpSqlite} from "@boundary/wimp/sqlite"
import {BoundaryAtomSqlite} from "@boundary/atom/sqlite"
import {BoundaryTopologySqlite} from "@boundary/topology/sqlite"
import type {ForceMessage} from "shared/protocol/force/message"
import {isReactionResultProposal} from "shared/protocol/force/reaction"
import {BoundaryIncrementalStore, type BoundaryIncrementalCommit} from "./incremental.ts"
import {BoundaryExecutionStore} from "./execution.ts"
import {BoundaryReactionStore} from "./reaction.ts"
import {BoundaryInputStore} from "./input.ts"
import {readBoundaryInitialState} from "./initial.ts"
import type {
  BoundaryInitialProjection,
  BoundaryInitialState,
} from "@metafor/types/boundary/initial"
import {MassCatalog} from "../shared/mass.ts"

export type BoundaryMetaJSONSnapshot = {
  initialState: BoundaryInitialState
  initialProjection: BoundaryInitialProjection
  originByInstance: Map<string, string>
  parentByInstance: Map<string, string>
}

const isFieldConsequence = (message: ForceMessage): boolean => {
  const part = message.parts[0]
  return (part.part === "gluon" || part.part === "higgs") &&
    (part.op === "add" || part.op === "replace" || part.op === "remove")
}

const isUncommittedFieldMutation = (message: ForceMessage): boolean =>
  isFieldConsequence(message) && message.parts[0].from === undefined

const reactionExecutionId = (input: ForceMessage): string | null => {
  const part = input.parts[0]
  if ((part.part !== "w+" && part.part !== "w-") || part.op !== "replace") return null
  return isReactionResultProposal(part.value) ? part.value.reactionExecutionId : null
}

const stampBoundaryCommit = (
  input: ForceMessage,
  commit: BoundaryIncrementalCommit,
): BoundaryIncrementalCommit => {
  const external = isUncommittedFieldMutation(input)
  const reactionId = reactionExecutionId(input)
  if (!external && reactionId === null) return commit

  const origin = external
    ? `boundary:${crypto.randomUUID()}`
    : `reaction:${reactionId}`
  return {
    ...commit,
    messages: commit.messages.map((message) => {
      if (!isFieldConsequence(message)) return message
      const part = message.parts[0]
      if (!external && part.from !== reactionId) return message
      if (external && part.from !== undefined) return message
      return {parts: [{...part, from: origin}]}
    }),
  }
}

export type BoundaryOpenOptions = {
  /** Explicit catalog injection keeps offline proofs away from the default Mass path. */
  massCatalog?: MassCatalog
}

export const open = async (filename?: string, options: BoundaryOpenOptions = {}) => {
  const fileBacked = filename !== undefined && filename !== ":memory:"
  if (fileBacked) mkdirSync(dirname(filename), {recursive: true})

  const sql = new SQL(fileBacked ? `sqlite://${filename}` : "sqlite::memory:")
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  // Topology precedes atom because both tables reference each other.
  const topology = await BoundaryTopologySqlite.open(sql)
  const atom = await BoundaryAtomSqlite.open(sql)
  const wimp = await BoundaryWimpSqlite.open(sql)
  const projection = new BoundaryIncrementalStore(sql, options.massCatalog ?? new MassCatalog())
  await projection.init()
  const execution = new BoundaryExecutionStore(sql)
  await execution.init()
  const reaction = new BoundaryReactionStore(sql)
  await reaction.init()
  const input = new BoundaryInputStore(sql)
  let absorbQueue: Promise<void> = Promise.resolve()

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = absorbQueue.then(operation)
    absorbQueue = task.then(() => undefined, () => undefined)
    return task
  }

  const materialize = (message: ForceMessage): Promise<BoundaryIncrementalCommit | null> => {
    return serialize(async () => {
      const executionCommit = await execution.apply(message)
      const reactionCommit = await reaction.apply(message)
      const inputCommit = await input.apply(message)
      const stateMatterCommit = executionCommit !== undefined
        ? await projection.reconcileStateMatter(message.parts[0])
        : null
      let rawCommit = executionCommit !== undefined
        ? stateMatterCommit ?? executionCommit
        : reactionCommit !== undefined
          ? reactionCommit
          : inputCommit !== undefined
            ? inputCommit
            : await projection.apply(message)
      if (!rawCommit) return null

	  // Boundary-originated topology consequences are not echoed back to the
	  // sender by Force. Expand them through the canonical Matter projection in
	  // the same commit, so enum/array writes materialize Fuzzy/Macho children
	  // atomically with the Process or Reaction result.
	  if (executionCommit || reactionCommit) {
		const messages: ForceMessage[] = []
		for (const consequence of rawCommit.messages) {
			if (consequence.parts[0]?.part !== "higgs") {
				messages.push(consequence)
				continue
			}
			const projected = await projection.apply(consequence)
			messages.push(...(projected?.messages ?? [consequence]))
		}
		rawCommit = {...rawCommit, messages}
	  }

      const commit = stampBoundaryCommit(message, rawCommit)
      const reactionSignals = await reaction.derive(commit.messages)
      return reactionSignals.length === 0
        ? commit
        : {...commit, messages: [...commit.messages, ...reactionSignals]}
    })
  }

  const readInitialProjection = async (): Promise<BoundaryInitialProjection> => ({
    version: 1,
    entries: (await projection.replay()).map((message) => {
      const {by: _by, ts: _ts, ...entry} = message.parts[0]
      return entry
    }),
  })

  const readMetaJSONSnapshot = (): Promise<BoundaryMetaJSONSnapshot> => serialize(async () => {
    const [initialState, initialProjection] = await Promise.all([
      readBoundaryInitialState(sql),
      readInitialProjection(),
    ])
    return {
      initialState,
      initialProjection,
      originByInstance: new Map(projection.originByInstance),
      parentByInstance: new Map(projection.parentByInstance),
    }
  })

  return {
    wimp,
    atom,
    topology,
    projection,
    execution,
    reaction,
    input,
    replay: () => projection.replay(),
    materialize,
    initialState: () => readBoundaryInitialState(sql),
    initialProjection: readInitialProjection,
    metaJSONSnapshot: readMetaJSONSnapshot,
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
