import type {SQL} from "bun"

export type BoundaryEnergyProcessDescriptor = {
  type: "action"
  key: string
  env: string[]
  action: {
    src: string
    importSpecifier?: string
    wrapperSrc?: string
    readFields: Array<[fieldId: number, key: string]>
  }
}

export type BoundaryEnergyRuntimeSnapshot = {
  version: 1
  actors: Array<[actorId: number, wimp: string]>
  processes: Array<{
    wimp: string
    state: string
    descriptor: BoundaryEnergyProcessDescriptor
  }>
}

type ActorRow = {id: number; wimp: string}
type ProcessActionRow = {
  wimp: string
  key: string
  action: string
  importSpecifier: string | null
  wrapperSrc: string | null
}
type ProcessEnvRow = {wimp: string; key: string; env: string}
type ProcessActionReadRow = {wimp: string; key: string; field: number; fieldKey: string}

const group = <T, K extends string | number>(rows: T[], key: (row: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const groupKey = key(row)
    const bucket = map.get(groupKey)
    if (bucket) bucket.push(row)
    else map.set(groupKey, [row])
  }
  return map
}

export async function energyRuntime(sql: SQL): Promise<BoundaryEnergyRuntimeSnapshot> {
  const actors = await sql<ActorRow[]>`SELECT id, wimp FROM actor ORDER BY rowid`
  const processActions = await sql<ProcessActionRow[]>`
    SELECT process.wimp, process.key,
           process_action.action,
           process_action.action_import_specifier AS importSpecifier,
           process_action.action_wrapper_src AS wrapperSrc
    FROM process_action
    JOIN process ON process.id = process_action.process
    ORDER BY process.wimp, process.rowid
  `
  const processEnvs = await sql<ProcessEnvRow[]>`
    SELECT process.wimp, process.key, process_env.env
    FROM process_env
    JOIN process ON process.id = process_env.process
    ORDER BY process.wimp, process.rowid, process_env.env
  `
  const processActionReads = await sql<ProcessActionReadRow[]>`
    SELECT process.wimp, process.key, par.field, field.key AS fieldKey
    FROM process_action_read par
    JOIN process ON process.id = par.process
    JOIN field ON field.id = par.field
    WHERE par.phase = 'action'
    ORDER BY process.wimp, process.rowid, field.rowid
  `
  const envsByProcess = group(processEnvs, (row) => `${row.wimp}\0${row.key}`)
  const readsByProcess = group(processActionReads, (row) => `${row.wimp}\0${row.key}`)

  return {
    version: 1,
    actors: actors.map((actor) => [actor.id, actor.wimp]),
    processes: processActions.map((process) => {
      const key = `${process.wimp}\0${process.key}`
      return {
        wimp: process.wimp,
        state: process.key,
        descriptor: {
          type: "action",
          key: process.key,
          env: (envsByProcess.get(key) ?? []).map((row) => row.env),
          action: {
            src: process.action,
            ...(process.importSpecifier !== null ? {importSpecifier: process.importSpecifier} : {}),
            ...(process.wrapperSrc !== null ? {wrapperSrc: process.wrapperSrc} : {}),
            readFields: (readsByProcess.get(key) ?? []).map((row) => [row.field, row.fieldKey]),
          },
        },
      }
    }),
  }
}
