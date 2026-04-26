import type { SQL } from "bun"
import type { MetaDSL, ParsedDestroy, ParsedProcess } from "../../.."
import type { ProcessActionReadRow, ProcessActionRow, ProcessActionWriteRow, ProcessRow } from "./process.t.ts"

export const getProcesses = async (
  sql: SQL,
  src: string,
  fieldKeys: Map<string, string>,
): Promise<NonNullable<MetaDSL["processes"]> | undefined> => {
  const processRows = await sql<ProcessRow[]>`
    SELECT uuid, key, type, label, desc
    FROM process
    WHERE meta = ${src}
    ORDER BY process.rowid
  `
  if (processRows.length === 0) return

  const envRows = await sql<Array<{ process: string; env: string }>>`
    SELECT process, env
    FROM process_env
    WHERE process IN (SELECT uuid FROM process WHERE meta = ${src})
    ORDER BY process_env.rowid
  `

  const envsByProcess = new Map<string, string[]>()
  for (const row of envRows) {
    const envs = envsByProcess.get(row.process) ?? []
    envs.push(row.env)
    envsByProcess.set(row.process, envs)
  }

  const actionRows = new Map(
    (
      await sql<ProcessActionRow[]>`
        SELECT process, action, action_import_specifier, action_wrapper_src, success, error
        FROM process_action
        WHERE process IN (SELECT uuid FROM process WHERE meta = ${src})
      `
    ).map((row) => [row.process, row]),
  )

  const actionReadRows = await sql<ProcessActionReadRow[]>`
    SELECT process_action_read.process AS process, process_action_read.phase AS phase, process_action_read.field AS field
    FROM process_action_read
    INNER JOIN process ON process.uuid = process_action_read.process
    WHERE process.meta = ${src}
    ORDER BY process_action_read.rowid
  `

  const actionWriteRows = await sql<ProcessActionWriteRow[]>`
    SELECT process_action_write.process AS process, process_action_write.phase AS phase, process_action_write.field AS field
    FROM process_action_write
    INNER JOIN process ON process.uuid = process_action_write.process
    WHERE process.meta = ${src}
    ORDER BY process_action_write.rowid
  `

  const finallyRows = new Map(
    (
      await sql<Array<{ process: string; before: string }>>`
        SELECT process, before
        FROM process_finally
        WHERE process IN (SELECT uuid FROM process WHERE meta = ${src})
      `
    ).map((row) => [row.process, row]),
  )

  const finallyReadRows = await sql<Array<{ process: string; field: string }>>`
    SELECT process_finally_read.process AS process, process_finally_read.field AS field
    FROM process_finally_read
    INNER JOIN process ON process.uuid = process_finally_read.process
    WHERE process.meta = ${src}
    ORDER BY process_finally_read.rowid
  `

  const readMap = new Map<string, Record<string, string[]>>()
  for (const row of actionReadRows) {
    const phases = readMap.get(row.process) ?? {}
    const fields = phases[row.phase] ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) fields.push(fieldKey)
    phases[row.phase] = fields
    readMap.set(row.process, phases)
  }

  const writeMap = new Map<string, Record<string, string[]>>()
  for (const row of actionWriteRows) {
    const phases = writeMap.get(row.process) ?? {}
    const fields = phases[row.phase] ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) fields.push(fieldKey)
    phases[row.phase] = fields
    writeMap.set(row.process, phases)
  }

  const finallyReads = new Map<string, string[]>()
  for (const row of finallyReadRows) {
    const fields = finallyReads.get(row.process) ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) fields.push(fieldKey)
    finallyReads.set(row.process, fields)
  }

  const processes: NonNullable<MetaDSL["processes"]> = {}

  for (const row of processRows) {
    if (row.type === "finally") {
      const finallyRow = finallyRows.get(row.uuid)
      if (!finallyRow) continue

      const process: ParsedDestroy = {
        type: "finally",
        before: {
          src: finallyRow.before,
        },
      }

      const reads = finallyReads.get(row.uuid)
      if (reads && reads.length > 0) process.before.read = reads
      if (row.label !== null) process.label = row.label
      if (row.desc !== null) process.desc = row.desc

      const envs = envsByProcess.get(row.uuid)
      if (envs && envs.length > 0) process.env = envs as NonNullable<ParsedDestroy["env"]>
      processes[row.key] = process
      continue
    }

    const actionRow = actionRows.get(row.uuid)
    if (!actionRow) continue

    const reads = readMap.get(row.uuid) ?? {}
    const writes = writeMap.get(row.uuid) ?? {}
    const process: ParsedProcess = {
      type: "action",
      action: {
        src: actionRow.action,
      },
    }

    if (actionRow.action_import_specifier !== null) {
      process.action.importSpecifier = actionRow.action_import_specifier
    }
    if (actionRow.action_wrapper_src !== null) {
      process.action.wrapperSrc = actionRow.action_wrapper_src
    }
    const actionReads = reads.action
    if (actionReads && actionReads.length > 0) process.action.read = actionReads

    if (actionRow.success !== null) {
      process.success = {
        src: actionRow.success,
      }
      const successReads = reads.success
      const successWrites = writes.success
      if (successReads && successReads.length > 0) process.success.read = successReads
      if (successWrites && successWrites.length > 0) process.success.write = successWrites
    }

    if (actionRow.error !== null) {
      process.error = {
        src: actionRow.error,
      }
      const errorReads = reads.error
      const errorWrites = writes.error
      if (errorReads && errorReads.length > 0) process.error.read = errorReads
      if (errorWrites && errorWrites.length > 0) process.error.write = errorWrites
    }

    if (row.label !== null) process.label = row.label
    if (row.desc !== null) process.desc = row.desc

    const envs = envsByProcess.get(row.uuid)
    if (envs && envs.length > 0) process.env = envs as NonNullable<ParsedProcess["env"]>

    processes[row.key] = process
  }

  return processes
}
