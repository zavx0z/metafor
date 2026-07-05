import type {SQL} from "bun"

export type BoundaryEnergyHandlerDescriptor = {
  src: string
  readFields: Array<[fieldId: number, key: string]>
  writeFields: Array<[fieldId: number, key: string]>
}

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
  success?: BoundaryEnergyHandlerDescriptor
  error?: BoundaryEnergyHandlerDescriptor
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
  success: string | null
  error: string | null
}
type ProcessEnvRow = {wimp: string; key: string; env: string}
type ProcessActionReadRow = {wimp: string; key: string; phase: string; field: number; fieldKey: string}
type ProcessActionWriteRow = {wimp: string; key: string; phase: string; field: number; fieldKey: string}

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
           process_action.action_wrapper_src AS wrapperSrc,
           process_action.success,
           process_action.error
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
    SELECT process.wimp, process.key, par.phase, par.field, field.key AS fieldKey
    FROM process_action_read par
    JOIN process ON process.id = par.process
    JOIN field ON field.id = par.field
    WHERE par.phase IN ('action', 'success', 'error')
    ORDER BY process.wimp, process.rowid, par.phase, field.rowid
  `
  const processActionWrites = await sql<ProcessActionWriteRow[]>`
    SELECT process.wimp, process.key, paw.phase, paw.field, field.key AS fieldKey
    FROM process_action_write paw
    JOIN process ON process.id = paw.process
    JOIN field ON field.id = paw.field
    WHERE paw.phase IN ('success', 'error')
    ORDER BY process.wimp, process.rowid, paw.phase, field.rowid
  `
  const envsByProcess = group(processEnvs, (row) => `${row.wimp}\0${row.key}`)
  const readsByProcessPhase = group(processActionReads, (row) => `${row.wimp}\0${row.key}\0${row.phase}`)
  const writesByProcessPhase = group(processActionWrites, (row) => `${row.wimp}\0${row.key}\0${row.phase}`)

  return {
    version: 1,
    actors: actors.map((actor) => [actor.id, actor.wimp]),
    processes: processActions.map((process) => {
      const key = `${process.wimp}\0${process.key}`
      const handler = (src: string | null, phase: "success" | "error"): BoundaryEnergyHandlerDescriptor | undefined => src === null
        ? undefined
        : {
            src,
            readFields: (readsByProcessPhase.get(`${key}\0${phase}`) ?? []).map((row) => [row.field, row.fieldKey]),
            writeFields: (writesByProcessPhase.get(`${key}\0${phase}`) ?? []).map((row) => [row.field, row.fieldKey]),
          }
      const success = handler(process.success, "success")
      const error = handler(process.error, "error")
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
            readFields: (readsByProcessPhase.get(`${key}\0action`) ?? []).map((row) => [row.field, row.fieldKey]),
          },
          ...(success !== undefined ? {success} : {}),
          ...(error !== undefined ? {error} : {}),
        },
      }
    }),
  }
}
