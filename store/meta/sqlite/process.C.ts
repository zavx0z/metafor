import type { SQL } from "bun"
import type { MetaDSL, ParsedDestroy, ParsedProcess } from "../../.."
import type { FieldUuidByKey } from "./process.t.ts"

const createProcessReads = async (
  sql: SQL,
  processUuid: string,
  phase: "action" | "success" | "error",
  fieldKeys: string[] | undefined,
  fieldUuids: FieldUuidByKey,
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) continue

    await sql`INSERT INTO process_action_read (process, field, phase) VALUES (${processUuid}, ${fieldUuid}, ${phase})`
  }
}

const createProcessWrites = async (
  sql: SQL,
  processUuid: string,
  phase: "success" | "error",
  fieldKeys: string[] | undefined,
  fieldUuids: FieldUuidByKey,
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) continue

    await sql`INSERT INTO process_action_write (process, field, phase) VALUES (${processUuid}, ${fieldUuid}, ${phase})`
  }
}

export async function createProcess(
  sql: SQL,
  meta: MetaDSL,
  src: string,
  fieldUuids: FieldUuidByKey,
): Promise<void> {
  if (!meta.processes) return

  for (const [state, p] of Object.entries(meta.processes)) {
    const uuid = crypto.randomUUID()
    const process = p as ParsedProcess | ParsedDestroy
    await sql`
      INSERT INTO process (uuid, meta, key, type, label, desc)
      VALUES (${uuid}, ${src}, ${state}, ${process.type || "action"}, ${process.label || null}, ${process.desc || null})
    `

    if (process.env) {
      for (const env of process.env) {
        await sql`INSERT INTO process_env (process, env) VALUES (${uuid}, ${env})`
      }
    }

    if (process.type === "finally") {
      await sql`INSERT INTO process_finally (process, before) VALUES (${uuid}, ${process.before.src})`

      for (const fieldKey of process.before.read ?? []) {
        const fieldUuid = fieldUuids.get(fieldKey)
        if (!fieldUuid) continue

        await sql`INSERT INTO process_finally_read (process, field) VALUES (${uuid}, ${fieldUuid})`
      }

      continue
    }

    await sql`
      INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
      VALUES (
        ${uuid},
        ${process.action.src},
        ${process.action.importSpecifier || null},
        ${process.action.wrapperSrc || null},
        ${process.success?.src || null},
        ${process.error?.src || null}
      )
    `

    await createProcessReads(sql, uuid, "action", process.action.read, fieldUuids)
    await createProcessReads(sql, uuid, "success", process.success?.read, fieldUuids)
    await createProcessReads(sql, uuid, "error", process.error?.read, fieldUuids)
    await createProcessWrites(sql, uuid, "success", process.success?.write, fieldUuids)
    await createProcessWrites(sql, uuid, "error", process.error?.write, fieldUuids)
  }
}
