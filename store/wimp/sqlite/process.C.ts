import type { SQL } from "bun"
import type { MetaDSL, ParsedDestroy, ParsedProcess } from "../../.."

const insertProcessReads = async (
  sql: SQL,
  src: string,
  processUuid: string,
  phase: "action" | "success" | "error",
  fieldKeys: string[] | undefined,
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    await sql`
      INSERT INTO process_action_read (process, field, phase)
      SELECT ${processUuid}, field.uuid, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }
}

const insertProcessWrites = async (
  sql: SQL,
  src: string,
  processUuid: string,
  phase: "success" | "error",
  fieldKeys: string[] | undefined,
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    await sql`
      INSERT INTO process_action_write (process, field, phase)
      SELECT ${processUuid}, field.uuid, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }
}

export async function createProcess(sql: SQL, meta: MetaDSL, src: string): Promise<void> {
  if (!meta.processes) return

  for (const [state, p] of Object.entries(meta.processes)) {
    const uuid = crypto.randomUUID()
    const process = p as ParsedProcess | ParsedDestroy
    await sql`
      INSERT INTO process (uuid, wimp, key, type, label, desc)
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
        await sql`
          INSERT INTO process_finally_read (process, field)
          SELECT ${uuid}, field.uuid
          FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
        `
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

    await insertProcessReads(sql, src, uuid, "action", process.action.read)
    await insertProcessReads(sql, src, uuid, "success", process.success?.read)
    await insertProcessReads(sql, src, uuid, "error", process.error?.read)
    await insertProcessWrites(sql, src, uuid, "success", process.success?.write)
    await insertProcessWrites(sql, src, uuid, "error", process.error?.write)
  }
}
